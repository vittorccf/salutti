"use server";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { ContactError, validEmail, validPhone } from "@/lib/contact-validation";
import { canSeeClinical } from "@/lib/permissions";
import { errorMessage } from "@/i18n/errors";
import { getTranslations } from "@/i18n/server";
import { assertInWorkspace } from "@/lib/tenant";
import { canAdvertise, isValidSlug, MODALITIES, REASON_MAX, SHIFTS, SOURCES, WAITLIST_STATUSES, WEEKDAYS } from "@/lib/waitlist";
import type { FormResult } from "@/components/forms/action-form";
import { requireWaitlist } from "./_lib";

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const oneOf = <T extends readonly string[]>(list: T, v: string, fallback: T[number]): T[number] => ((list as readonly string[]).includes(v) ? v : fallback);
const many = <T extends readonly string[]>(list: T, values: FormDataEntryValue[]) => values.map(String).filter((v) => (list as readonly string[]).includes(v));
const PATH = "/app/lista-espera";

async function err(key: string): Promise<FormResult> {
  const t = await getTranslations("waitlist.errors");
  return { erro: t(key) };
}

// Inclui ou edita uma pessoa na lista (cadastro manual pela equipe).
export async function saveEntryAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireWaitlist();
  const wsId = ctx.workspace.id;
  const id = str(fd, "id") || null;
  const fullName = str(fd, "fullName", 120);
  if (fullName.length < 2) return err("nameRequired");
  let phone: string | null, email: string | null;
  try {
    phone = validPhone(fd.get("phone"), { country: fd.get("phoneCountry") });
    email = await validEmail(fd.get("email"));
  } catch (e) {
    if (e instanceof ContactError) return { erro: await errorMessage(e) };
    throw e;
  }
  if (!phone && !email) return err("contactRequired");
  const professionalId = str(fd, "professionalId") || null;
  if (professionalId) await assertInWorkspace(wsId, { professionalId });
  const isMinor = fd.get("isMinor") === "on";
  const guardianName = isMinor ? str(fd, "guardianName", 120) || null : null;
  if (isMinor && !guardianName) return err("guardianRequired");
  const data = {
    fullName,
    phone,
    email,
    isMinor,
    guardianName,
    // O motivo é dado de saúde: só papel clínico grava (quem não vê o campo não pode apagá-lo sem querer).
    ...(canSeeClinical(ctx) ? { reason: str(fd, "reason", REASON_MAX) || null } : {}),
    modality: oneOf(MODALITIES, str(fd, "modality"), "indiferente"),
    preferredDays: many(WEEKDAYS, fd.getAll("days")),
    preferredShifts: many(SHIFTS, fd.getAll("shifts")),
    professionalId,
    priceNote: str(fd, "priceNote", 120) || null,
    source: oneOf(SOURCES, str(fd, "source"), "outro"),
    priority: fd.get("priority") === "1" ? 1 : 0,
    notes: str(fd, "notes", 1000) || null,
  };
  let entryId = id;
  if (id) {
    const res = await db.waitlistEntry.updateMany({ where: { id, workspaceId: wsId, anonymizedAt: null }, data });
    if (!res.count) return err("notFound");
  } else {
    entryId = (await db.waitlistEntry.create({ data: { ...data, workspaceId: wsId, createdVia: "manual" } })).id;
  }
  await recordAudit({ workspaceId: wsId, userId: ctx.user.id, action: id ? "waitlist.update" : "waitlist.create", entity: "WaitlistEntry", entityId: entryId! });
  revalidatePath(PATH);
  const t = await getTranslations("waitlist");
  return { ok: t("saved", { name: fullName }) };
}

// Registrar contato (WhatsApp, ligação): conta tentativas e passa "aguardando" para "contatado".
export async function contactAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireWaitlist();
  const id = str(fd, "id");
  const entry = await db.waitlistEntry.findFirst({ where: { id, workspaceId: ctx.workspace.id, anonymizedAt: null } });
  if (!entry) return err("notFound");
  await db.waitlistEntry.update({
    where: { id },
    data: {
      contactAttempts: { increment: 1 },
      lastContactAt: new Date(),
      ...(entry.status === "aguardando" ? { status: "contatado", statusChangedAt: new Date() } : {}),
    },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "waitlist.contact", entity: "WaitlistEntry", entityId: id });
  revalidatePath(PATH);
  const t = await getTranslations("waitlist");
  return { ok: t("contactRegistered") };
}

export async function setStatusAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireWaitlist();
  const status = str(fd, "status");
  if (!(WAITLIST_STATUSES as readonly string[]).includes(status)) return err("generic");
  const res = await db.waitlistEntry.updateMany({
    where: { id: str(fd, "id"), workspaceId: ctx.workspace.id, anonymizedAt: null },
    data: { status, statusChangedAt: new Date() },
  });
  if (!res.count) return err("notFound");
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "waitlist.status", entity: "WaitlistEntry", entityId: str(fd, "id"), metadata: { status } });
  revalidatePath(PATH);
  const t = await getTranslations("waitlist");
  return { ok: t("statusSaved") };
}

class ConvertStop extends Error {}

// Virou paciente: cria o cadastro com o que já há (nome e contato) e abre a agenda para a primeira sessão.
// Numa transação: a entrada é "reservada" antes (dois cliques não criam dois pacientes) e o limite do contrato é conferido junto.
export async function convertAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireWaitlist();
  const wsId = ctx.workspace.id;
  const entry = await db.waitlistEntry.findFirst({ where: { id: str(fd, "id"), workspaceId: wsId, anonymizedAt: null } });
  if (!entry) return err("notFound");
  if (entry.convertedPatientId) redirect(`/app/agenda/novo?patientId=${entry.convertedPatientId}`);
  let patientId: string;
  try {
    patientId = await db.$transaction(async (tx) => {
      const claim = await tx.waitlistEntry.updateMany({
        where: { id: entry.id, workspaceId: wsId, convertedPatientId: null, anonymizedAt: null },
        data: { status: "agendado", statusChangedAt: new Date() },
      });
      if (!claim.count) throw new ConvertStop("notFound");
      if (ctx.workspace.maxPatients !== null) {
        // Trava a linha do consultório: duas conversões ao mesmo tempo não passam do limite.
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${wsId} FOR UPDATE`;
        const active = await tx.patient.count({ where: { workspaceId: wsId, deletedAt: null, active: true } });
        if (active >= ctx.workspace.maxPatients) throw new ConvertStop("patientLimit");
      }
      const patient = await tx.patient.create({
        data: { workspaceId: wsId, fullName: entry.fullName, phone: entry.phone, email: entry.email, responsibleName: entry.guardianName },
      });
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { convertedPatientId: patient.id } });
      return patient.id;
    });
  } catch (e) {
    if (e instanceof ConvertStop) return err(e.message);
    throw e;
  }
  await recordAudit({ workspaceId: wsId, userId: ctx.user.id, action: "waitlist.convert", entity: "Patient", entityId: patientId });
  revalidatePath(PATH);
  redirect(`/app/agenda/novo?patientId=${patientId}`);
}

// Pedido de exclusão (LGPD) ou cadastro por engano: apaga de vez.
export async function deleteEntryAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireWaitlist();
  const res = await db.waitlistEntry.deleteMany({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
  if (!res.count) return err("notFound");
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "waitlist.delete", entity: "WaitlistEntry", entityId: str(fd, "id") });
  revalidatePath(PATH);
  const t = await getTranslations("waitlist");
  return { ok: t("deleted") };
}

// Formulário público (endereço, previsão e texto): quem gerencia a equipe e as configurações do consultório.
export async function saveSettingsAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireWaitlist();
  if (!ctx.permissions.has("equipe.gerenciar")) return err("onlyManager");
  const enabled = fd.get("public") === "on";
  const slug = str(fd, "slug", 40).toLowerCase() || null;
  if (enabled && !slug) return err("slugInvalid");
  if (slug && !isValidSlug(slug)) return err("slugInvalid");
  if (enabled) {
    // A página pública mostra quem atende com o registro no conselho; sem isso, não publica.
    const pros = await db.professional.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, select: { councilNumber: true, noCouncil: true } });
    if (!pros.some(canAdvertise)) return err("needsCouncil");
  }
  if (slug) {
    const taken = await db.workspace.findFirst({ where: { waitlistSlug: slug, id: { not: ctx.workspace.id } }, select: { id: true } });
    if (taken) return err("slugTaken");
  }
  try {
    await db.workspace.update({
      where: { id: ctx.workspace.id },
      data: { waitlistPublic: enabled, waitlistSlug: slug, waitlistEstimate: str(fd, "estimate", 120) || null, waitlistIntro: str(fd, "intro", 500) || null },
    });
  } catch (e) {
    // Dois consultórios salvando o mesmo endereço ao mesmo tempo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return err("slugTaken");
    throw e;
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "waitlist.settings", entity: "Workspace", entityId: ctx.workspace.id, metadata: { enabled, slug } });
  revalidatePath(PATH);
  const t = await getTranslations("waitlist");
  return { ok: t("settingsSaved") };
}
