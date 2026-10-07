"use server";
// Ações da Salutti Estética: catálogo de procedimentos, registro do atendimento (baixa de estoque), termo de
// consentimento e fotos clínicas. Todas exigem o módulo "procedimentos" ligado na área do consultório.
import { createHash } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "@/i18n/server";
import { errorMessage } from "@/i18n/errors";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertInWorkspace } from "@/lib/tenant";
import { recordUse, reverseUse, StockError } from "@/lib/stock";
import { UploadError } from "@/lib/media";
import { stageImage } from "@/lib/media-store";
import { parseDateOnly, dateKeySP } from "@/lib/dates";
import { isPhotoStage, isProcedureCategory, parseQuantity } from "@/lib/procedures";
import type { FormResult } from "@/components/forms/action-form";
import { requireProceduresContext } from "./_lib";

// Mensagem de erro própria (chave de aesthetics.errors), traduzida em `fail`.
class AestheticsError extends Error {}

// Contexto das ações: módulo ligado e papel clínico (registro de insumo em paciente, termo e foto são dados de saúde).
const aestheticsContext = () => requireProceduresContext({ clinical: true });

const fail = async (e: unknown): Promise<FormResult> => {
  const t = await getTranslations("aesthetics.errors");
  if (e instanceof AestheticsError) return { erro: t.has(e.message) ? t(e.message) : e.message };
  if (e instanceof StockError) {
    // stock.errors.* (namespace do estoque) via errorMessage; se ainda não houver o texto lá, usa o daqui.
    const msg = await errorMessage(e);
    if (msg !== e.key) return { erro: msg };
    return { erro: t.has(`stock.${e.key}`) ? t(`stock.${e.key}`) : msg };
  }
  if (e instanceof UploadError) return { erro: await errorMessage(e) };
  throw e;
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

const str = (formData: FormData, name: string, max: number) => {
  const v = String(formData.get(name) ?? "").trim();
  if (v.length > max) throw new AestheticsError("tooLong");
  return v;
};

// ----------------------------- Catálogo -----------------------------

function readProcedure(formData: FormData) {
  const name = str(formData, "name", 120);
  if (name.length < 2) throw new AestheticsError("nameRequired");
  const category = String(formData.get("category") ?? "");
  if (!isProcedureCategory(category)) throw new AestheticsError("category");
  const duration = Number(formData.get("durationMinutes"));
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) throw new AestheticsError("duration");
  const priceRaw = parseQuantity(formData.get("price"));
  if (priceRaw !== null && Number.isNaN(priceRaw)) throw new AestheticsError("price");
  const returnRaw = String(formData.get("returnDays") ?? "").trim();
  const returnDays = returnRaw ? Number(returnRaw) : null;
  if (returnDays !== null && (!Number.isInteger(returnDays) || returnDays < 1 || returnDays > 730)) {
    throw new AestheticsError("returnDays");
  }
  const products = formData.getAll("supplyProduct").map(String);
  const quantities = formData.getAll("supplyQuantity");
  const supplies: { productId: string; quantity: number }[] = [];
  products.forEach((productId, i) => {
    if (!productId) return;
    const q = parseQuantity(quantities[i]);
    if (q === null || Number.isNaN(q) || q <= 0) throw new AestheticsError("quantity");
    if (supplies.some((s) => s.productId === productId)) throw new AestheticsError("duplicateProduct");
    supplies.push({ productId, quantity: q });
  });
  return {
    data: {
      name,
      category,
      durationMinutes: duration,
      price: priceRaw,
      returnDays,
      consentText: str(formData, "consentText", 10_000) || null,
      notes: str(formData, "notes", 2000) || null,
      active: formData.get("active") === "on",
    },
    supplies,
  };
}

async function assertProducts(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return;
  const n = await db.product.count({ where: { workspaceId, id: { in: ids } } });
  if (n !== ids.length) throw new AestheticsError("product");
}

export async function saveProcedureAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await aestheticsContext();
  const id = String(formData.get("id") ?? "") || null;
  let savedId: string;
  try {
    const { data, supplies } = readProcedure(formData);
    await assertProducts(ctx.workspace.id, supplies.map((s) => s.productId));
    if (id) {
      const existing = await db.procedure.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { id: true } });
      if (!existing) notFound();
      await db.$transaction([
        db.procedure.update({ where: { id }, data }),
        db.procedureSupply.deleteMany({ where: { procedureId: id } }),
        db.procedureSupply.createMany({ data: supplies.map((s) => ({ ...s, procedureId: id })) }),
      ]);
      savedId = id;
    } else {
      const created = await db.procedure.create({
        data: { ...data, workspaceId: ctx.workspace.id, supplies: { create: supplies } },
      });
      savedId = created.id;
    }
  } catch (e) {
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: id ? "procedure.update" : "procedure.create",
    entity: "Procedure",
    entityId: savedId,
  });
  redirect("/app/procedimentos");
}

// ----------------------------- Sessão -----------------------------

async function sessionFor(workspaceId: string, appointmentId: string) {
  await assertInWorkspace(workspaceId, { appointmentId });
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, workspaceId } });
  if (!appt) notFound();
  return appt;
}

export async function recordProcedureAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await aestheticsContext();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const appt = await sessionFor(ctx.workspace.id, appointmentId);
  let used: Awaited<ReturnType<typeof recordUse>>;
  try {
    if (!appt.procedureId) throw new AestheticsError("procedure");
    if (appt.procedureRecordedAt) throw new AestheticsError("alreadyRecorded");
    const details = str(formData, "procedureDetails", 4000) || null;
    const adverse = str(formData, "procedureAdverseEvent", 4000) || null;
    const products = formData.getAll("product").map(String);
    const quantities = formData.getAll("quantity");
    const lots = formData.getAll("lot").map(String);
    const items: { productId: string; lotId: string | null; quantity: number }[] = [];
    products.forEach((productId, i) => {
      const q = parseQuantity(quantities[i]);
      if (!productId || q === null || q === 0) return;
      if (Number.isNaN(q)) throw new AestheticsError("quantity");
      items.push({ productId, lotId: lots[i] || null, quantity: q });
    });
    // Procedimento sem insumo (ex.: limpeza de pele) registra só a ficha técnica.
    if (items.length === 0 && !details) throw new AestheticsError("nothingToRecord");
    // recordUse marca a sessão como registrada (na mesma transação: clique duplo não baixa duas vezes), confere
    // produto e lote no workspace e recusa lote vencido ou saldo insuficiente.
    used = await recordUse({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      appointmentId: appt.id,
      patientId: appt.patientId,
      items,
      appointmentData: { procedureDetails: details, procedureAdverseEvent: adverse },
    });
  } catch (e) {
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "procedure.record",
    entity: "Appointment",
    entityId: appt.id,
    metadata: { procedureId: appt.procedureId, items: used.length },
  });
  redirect(`/app/agenda/${appt.id}?registrado=1`);
}

// Estorno do registro (lançamento errado): devolve o estoque com motivo e libera a sessão para registrar de novo.
export async function reverseProcedureAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await aestheticsContext();
  const appt = await sessionFor(ctx.workspace.id, String(formData.get("appointmentId") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  let reversed: Awaited<ReturnType<typeof reverseUse>>;
  try {
    reversed = await reverseUse({ workspaceId: ctx.workspace.id, userId: ctx.user.id, appointmentId: appt.id, reason });
  } catch (e) {
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "procedure.reverse",
    entity: "Appointment",
    entityId: appt.id,
    metadata: { procedureId: appt.procedureId, lots: reversed.length, reason },
  });
  redirect(`/app/agenda/${appt.id}?estornado=1`);
}

// Termo aceito: grava o consentimento com o hash do texto do termo (prova de qual versão foi aceita).
export async function acceptConsentAction(formData: FormData) {
  const ctx = await aestheticsContext();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const appt = await sessionFor(ctx.workspace.id, appointmentId);
  const procedure = appt.procedureId
    ? await db.procedure.findFirst({ where: { id: appt.procedureId, workspaceId: ctx.workspace.id } })
    : null;
  if (!procedure?.consentText) notFound();
  const record = await db.consentRecord.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId: appt.patientId,
      purpose: "procedimento",
      legalBasis: "consentimento",
      granted: true,
      documentHash: sha256(procedure.consentText),
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "consent.procedure",
    entity: "ConsentRecord",
    entityId: record.id,
    metadata: { appointmentId: appt.id, procedureId: procedure.id },
  });
  redirect(`/app/agenda/${appt.id}`);
}

// ----------------------------- Fotos clínicas -----------------------------

export async function uploadClinicalPhotoAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await aestheticsContext();
  const patientId = String(formData.get("patientId") ?? "");
  await assertInWorkspace(ctx.workspace.id, { patientId });
  const procedureId = String(formData.get("procedureId") ?? "") || null;
  if (procedureId && (await db.procedure.count({ where: { id: procedureId, workspaceId: ctx.workspace.id } })) === 0) notFound();
  const allowMarketing = formData.get("allowMarketing") === "on";
  let staged: Awaited<ReturnType<typeof stageImage>> | null = null;
  let photoId: string;
  try {
    const stage = String(formData.get("stage") ?? "");
    if (!isPhotoStage(stage)) throw new AestheticsError("photoStage");
    const takenRaw = String(formData.get("takenAt") ?? "");
    if (takenRaw && !/^\d{4}-\d{2}-\d{2}$/.test(takenRaw)) throw new AestheticsError("takenAt");
    const region = str(formData, "region", 80) || null;
    // Autorização de uso clínico obrigatória (checkbox do ImageUpload); divulgação é outra, opcional.
    staged = await stageImage(formData, "photo", null, "clinical_photo", { workspaceId: ctx.workspace.id }, { requireConsent: true });
    if (!staged.id) throw new AestheticsError("photoRequired");
    const photo = await db.clinicalPhoto.create({
      data: {
        workspaceId: ctx.workspace.id,
        patientId,
        procedureId,
        mediaId: staged.id,
        stage,
        region,
        allowMarketing,
        takenAt: takenRaw && takenRaw !== dateKeySP() ? parseDateOnly(takenRaw) : new Date(),
      },
    });
    photoId = photo.id;
    // Um consentimento vigente por finalidade e paciente (não um por foto).
    const purposes = ["foto_clinica", ...(allowMarketing ? ["foto_divulgacao"] : [])];
    const current = await db.consentRecord.findMany({
      where: { workspaceId: ctx.workspace.id, patientId, purpose: { in: purposes }, granted: true, revokedAt: null },
      select: { purpose: true },
    });
    const missing = purposes.filter((p) => !current.some((c) => c.purpose === p));
    if (missing.length) {
      await db.consentRecord.createMany({
        data: missing.map((purpose) => ({ workspaceId: ctx.workspace.id, patientId, purpose, legalBasis: "consentimento", granted: true })),
      });
    }
    await staged.commit();
  } catch (e) {
    await staged?.rollback();
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "clinical_photo.create",
    entity: "ClinicalPhoto",
    entityId: photoId,
    metadata: { patientId, allowMarketing },
  });
  // Recarrega a ficha (limpa o formulário e evita reenviar a mesma foto).
  redirect(`/app/pacientes/${patientId}?foto=1#fotos-clinicas`);
}

// Remoção lógica: a foto sai da ficha, mas o registro e a imagem ficam guardados com o motivo (prontuário).
// A exclusão definitiva só acontece pela LGPD (anonimizar ou excluir a paciente).
export async function removeClinicalPhotoAction(formData: FormData) {
  const ctx = await aestheticsContext();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;
  const photo = await db.clinicalPhoto.findFirst({ where: { id, workspaceId: ctx.workspace.id, removedAt: null } });
  if (!photo) notFound();
  await db.clinicalPhoto.update({ where: { id: photo.id }, data: { removedAt: new Date(), removedReason: reason, allowMarketing: false } });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "clinical_photo.remove",
    entity: "ClinicalPhoto",
    entityId: photo.id,
    metadata: { patientId: photo.patientId, reason },
  });
  redirect(`/app/pacientes/${photo.patientId}#fotos-clinicas`);
}

// Revoga a autorização de divulgação da foto. Sem nenhuma foto ainda autorizada, revoga também o consentimento
// "foto_divulgacao" da paciente.
export async function revokeMarketingAction(formData: FormData) {
  const ctx = await aestheticsContext();
  const id = String(formData.get("id") ?? "");
  const photo = await db.clinicalPhoto.findFirst({ where: { id, workspaceId: ctx.workspace.id, allowMarketing: true } });
  if (!photo) notFound();
  const now = new Date();
  await db.clinicalPhoto.update({ where: { id: photo.id }, data: { allowMarketing: false, marketingRevokedAt: now } });
  const stillAllowed = await db.clinicalPhoto.count({
    where: { workspaceId: ctx.workspace.id, patientId: photo.patientId, allowMarketing: true, removedAt: null },
  });
  if (stillAllowed === 0) {
    await db.consentRecord.updateMany({
      where: { workspaceId: ctx.workspace.id, patientId: photo.patientId, purpose: "foto_divulgacao", revokedAt: null },
      data: { revokedAt: now },
    });
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "clinical_photo.revoke_marketing",
    entity: "ClinicalPhoto",
    entityId: photo.id,
    metadata: { patientId: photo.patientId },
  });
  redirect(`/app/pacientes/${photo.patientId}#fotos-clinicas`);
}
