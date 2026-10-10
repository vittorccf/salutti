"use server";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, type DbTransaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { addMonthsKey } from "@/lib/payables";
import { pix } from "@/lib/providers/pix";
import { assertInWorkspace } from "@/lib/tenant";
import {
  isToothResult,
  isValidTooth,
  MAX_INSTALLMENTS,
  normalizeFaces,
  planShouldConclude,
  planTotals,
  recallReasonFor,
  splitInstallments,
  statusAfter,
} from "@/lib/odonto";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { canApprovePlans, canClinicalWrite, canEditPlans, findPatient, findPlan, requireOdonto } from "@/app/app/odonto/_lib";
import { dateKeyOf, money, str } from "@/app/app/odonto/_form";

const path = (id: string) => `/app/planos/${id}`;

class Stop extends Error {}

async function err(key: string, values?: Record<string, string | number>): Promise<FormResult> {
  const t = await getTranslations("odonto.plans.errors");
  return { erro: t(key, values) };
}

// Trava a linha do plano (FOR UPDATE) e confere a situação: editar, aprovar, recusar e cancelar não se cruzam.
async function lockPlan(tx: DbTransaction, planId: string, status: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "TreatmentPlan" WHERE id = ${planId} AND status = ${status} FOR UPDATE`;
  if (!rows.length) throw new Stop("locked");
}

// Novo plano em estudo, numerado por consultório ("orçamento 12"). Corrida no número: tenta de novo.
export async function createPlanAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditPlans);
  const patient = await findPatient(ctx, str(fd, "patientId"));
  const professionalId = str(fd, "professionalId") || null;
  if (professionalId) await assertInWorkspace(ctx.workspace.id, { professionalId });
  let planId = "";
  for (let attempt = 0; attempt < 3 && !planId; attempt++) {
    try {
      const last = await db.treatmentPlan.aggregate({ where: { workspaceId: ctx.workspace.id }, _max: { number: true } });
      const plan = await db.treatmentPlan.create({
        data: {
          workspaceId: ctx.workspace.id,
          patientId: patient.id,
          professionalId,
          number: (last._max.number ?? 0) + 1,
          title: str(fd, "title", 120) || null,
          validUntil: parseDateOnly(addMonthsKey(dateKeySP(), 1)),
        },
      });
      planId = plan.id;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!planId) return err("generic");
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.plan.create", entity: "TreatmentPlan", entityId: planId });
  redirect(path(planId));
}

// Item do plano: procedimento ativo da tabela (ou avulso), dente e faces quando é por dente, valor (padrão: o da tabela).
export async function addItemAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditPlans);
  const plan = await findPlan(ctx, str(fd, "planId"));
  if (plan.status !== "em_estudo") return err("locked");
  const procedureId = str(fd, "procedureId") || null;
  const proc = procedureId ? await db.dentalProcedure.findFirst({ where: { id: procedureId, workspaceId: ctx.workspace.id, active: true } }) : null;
  if (procedureId && !proc) return err("generic");
  const name = proc?.name ?? str(fd, "name", 160);
  if (!name) return err("nameRequired");
  const toothRaw = str(fd, "tooth");
  const tooth = toothRaw ? Number(toothRaw) : null;
  if (tooth !== null && !isValidTooth(tooth)) return err("tooth");
  if (proc?.perTooth && tooth === null) return err("toothRequired", { name });
  const priceRaw = str(fd, "price");
  const price = priceRaw ? money(priceRaw) : proc?.price ?? null;
  if (price === null) return err("price");
  try {
    await db.$transaction(async (tx) => {
      await lockPlan(tx, plan.id, "em_estudo");
      const position = await tx.treatmentItem.count({ where: { planId: plan.id } });
      await tx.treatmentItem.create({
        data: {
          workspaceId: ctx.workspace.id,
          planId: plan.id,
          procedureId: proc?.id ?? null,
          name,
          tussCode: proc?.tussCode ?? (str(fd, "tussCode", 12).replace(/\D/g, "") || null),
          tooth,
          faces: tooth ? normalizeFaces(fd.getAll("faces").map(String).join(""), tooth) : null,
          price,
          toothResult: proc?.toothResult && isToothResult(proc.toothResult) ? proc.toothResult : null,
          returnMonths: proc?.returnMonths ?? null,
          position,
        },
      });
    });
  } catch (e) {
    if (e instanceof Stop) return err(e.message);
    throw e;
  }
  // Valor diferente da tabela fica registrado (quem mudou, de quanto para quanto).
  if (proc && proc.price !== null && priceRaw && price !== proc.price) {
    await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.item.price", entity: "TreatmentPlan", entityId: plan.id, metadata: { procedure: proc.name, table: proc.price, price } });
  }
  revalidatePath(path(plan.id));
  const t = await getTranslations("odonto.plans");
  return { ok: t("itemAdded", { name }) };
}

export async function removeItemAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditPlans);
  const plan = await findPlan(ctx, str(fd, "planId"));
  try {
    await db.$transaction(async (tx) => {
      await lockPlan(tx, plan.id, "em_estudo");
      await tx.treatmentItem.deleteMany({ where: { id: str(fd, "itemId"), planId: plan.id, workspaceId: ctx.workspace.id } });
    });
  } catch (e) {
    if (e instanceof Stop) return err(e.message);
    throw e;
  }
  revalidatePath(path(plan.id));
  const t = await getTranslations("odonto.plans");
  return { ok: t("itemRemoved") };
}

// Condições do orçamento: título, profissional, desconto, parcelas, 1º vencimento, validade e observações.
export async function updatePlanAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditPlans);
  const plan = await findPlan(ctx, str(fd, "planId"));
  const discount = money(str(fd, "discount") || "0");
  const installments = Number(str(fd, "installments") || "1");
  if (discount === null) return err("price");
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) return err("installments", { max: MAX_INSTALLMENTS });
  const professionalId = str(fd, "professionalId") || null;
  if (professionalId) await assertInWorkspace(ctx.workspace.id, { professionalId });
  const first = dateKeyOf(str(fd, "firstDueDate"));
  const valid = dateKeyOf(str(fd, "validUntil"));
  if (first && first < dateKeySP()) return err("firstDuePast");
  try {
    await db.$transaction(async (tx) => {
      await lockPlan(tx, plan.id, "em_estudo");
      await tx.treatmentPlan.update({
        where: { id: plan.id },
        data: {
          title: str(fd, "title", 120) || null,
          professionalId,
          discount,
          installments,
          firstDueDate: first ? parseDateOnly(first) : null,
          validUntil: valid ? parseDateOnly(valid) : null,
          notes: str(fd, "notes", 2000) || null,
        },
      });
    });
  } catch (e) {
    if (e instanceof Stop) return err(e.message);
    throw e;
  }
  if (discount !== plan.discount) {
    await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.plan.discount", entity: "TreatmentPlan", entityId: plan.id, metadata: { from: plan.discount, to: discount } });
  }
  revalidatePath(path(plan.id));
  const t = await getTranslations("odonto.plans");
  return { ok: t("saved") };
}

// Aprovação do paciente: gera as parcelas em Cobranças (com link de pagamento), numa transação que trava o plano e
// recalcula os totais lá dentro. Exige o dentista responsável; orçamento vencido precisa de nova validade; 1º
// vencimento no passado vira hoje (nenhuma parcela nasce vencida).
export async function approvePlanAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canApprovePlans);
  const plan = await findPlan(ctx, str(fd, "planId"));
  if (plan.status !== "em_estudo") return err("locked");
  if (!plan.professionalId) return err("professionalRequired");
  const today = dateKeySP();
  if (plan.validUntil && dateKeySP(plan.validUntil) < today) return err("expired");
  const method = ["pix", "boleto", "card", "dinheiro"].includes(str(fd, "method")) ? str(fd, "method") : "pix";
  let count = 0;
  let net = 0;
  try {
    await db.$transaction(async (tx) => {
      await lockPlan(tx, plan.id, "em_estudo");
      const fresh = await tx.treatmentPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { items: { select: { price: true, status: true } } } });
      const totals = planTotals(fresh.items, fresh.discount);
      if (!totals.count) throw new Stop("empty");
      net = totals.net;
      const firstKey = fresh.firstDueDate && dateKeySP(fresh.firstDueDate) >= today ? dateKeySP(fresh.firstDueDate) : today;
      const parts = totals.net > 0 ? splitInstallments(totals.net, fresh.installments, firstKey) : [];
      count = parts.length;
      await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: "aprovado", approvedAt: new Date() } });
      for (const p of parts) {
        const txid = pix.generateChargeId();
        const charge = await tx.charge.create({
          data: {
            workspaceId: ctx.workspace.id,
            patientId: plan.patientId,
            amount: p.amount,
            method,
            dueDate: parseDateOnly(p.dueKey),
            externalId: txid,
            pixCopyPaste: method === "pix" ? pix.generateCopyPaste(p.amount, txid) : null,
            treatmentPlanId: plan.id,
            installment: p.number,
          },
        });
        await tx.paymentLink.create({ data: { workspaceId: ctx.workspace.id, chargeId: charge.id, token: txid, url: `/pay/${txid}` } });
      }
    });
  } catch (e) {
    if (e instanceof Stop) return err(e.message);
    throw e;
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.plan.approve", entity: "TreatmentPlan", entityId: plan.id, metadata: { net, installments: count, method } });
  revalidatePath(path(plan.id));
  // O cartão de decisão some depois da aprovação: a confirmação vai pela URL.
  redirect(`${path(plan.id)}?aprovado=${count}`);
}

// Recusado (paciente não aceitou), reaberto para revisar, ou cancelado. Plano aprovado só cancela se nada foi feito
// nem pago: com trabalho realizado ou parcela paga, o acerto é feito em Cobranças (não se apaga o que é devido).
export async function setPlanStatusAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditPlans);
  const plan = await findPlan(ctx, str(fd, "planId"));
  const to = str(fd, "status");
  const allowed: Record<string, string[]> = { em_estudo: ["recusado", "cancelado"], recusado: ["em_estudo"], aprovado: ["cancelado"] };
  if (!allowed[plan.status]?.includes(to)) return err("locked");
  if (plan.status === "aprovado") {
    if (!canApprovePlans(ctx)) return err("onlyFinance");
    if (plan.items.some((i) => i.status === "realizado") || plan.charges.some((c) => c.status === "paid")) return err("cancelBlocked");
  }
  try {
    await db.$transaction(async (tx) => {
      await lockPlan(tx, plan.id, plan.status);
      await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: to } });
      if (to === "cancelado") {
        await tx.charge.updateMany({ where: { treatmentPlanId: plan.id, workspaceId: ctx.workspace.id, status: { in: ["pending", "overdue"] } }, data: { status: "cancelled" } });
        await tx.treatmentItem.updateMany({ where: { planId: plan.id, status: "planejado" }, data: { status: "cancelado" } });
      }
    });
  } catch (e) {
    if (e instanceof Stop) return err(e.message);
    throw e;
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.plan.status", entity: "TreatmentPlan", entityId: plan.id, metadata: { from: plan.status, to } });
  revalidatePath(path(plan.id));
  redirect(`${path(plan.id)}?situacao=${to}`);
}

// Procedimento realizado (ato clínico): vira evolução no prontuário (data, dente e faces, procedimento, quem fez),
// atualiza o odontograma, agenda o retorno sugerido e conclui o plano no fim. Dentista marca em nome próprio.
export async function completeItemAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canClinicalWrite);
  const plan = await findPlan(ctx, str(fd, "planId"));
  if (plan.status !== "aprovado") return err("notApproved");
  const item = plan.items.find((i) => i.id === str(fd, "itemId"));
  if (!item || item.status !== "planejado") return err("generic");
  const own = await db.professional.findFirst({ where: { workspaceId: ctx.workspace.id, userId: ctx.user.id, active: true }, select: { id: true } });
  const professionalId = ctx.role === "professional" ? own?.id ?? null : str(fd, "professionalId") || own?.id || null;
  if (!professionalId) return err("doneProfessionalRequired");
  await assertInWorkspace(ctx.workspace.id, { professionalId });
  const note = str(fd, "evolution", 2000);
  const proc = item.procedureId ? await db.dentalProcedure.findFirst({ where: { id: item.procedureId, workspaceId: ctx.workspace.id }, select: { specialty: true } }) : null;
  const t = await getTranslations("odonto.plans");
  const evolution = [
    t("evolution.line", {
      procedure: item.name,
      tooth: item.tooth ? t("evolution.tooth", { tooth: item.tooth, faces: item.faces ?? "-" }) : t("evolution.noTooth"),
      number: plan.number,
    }),
    item.tussCode ? `TUSS ${item.tussCode}` : null,
    note || null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const now = new Date();
  await db.$transaction(async (tx) => {
    const res = await tx.treatmentItem.updateMany({ where: { id: item.id, status: "planejado" }, data: { status: "realizado", doneAt: now, professionalId } });
    if (!res.count) return;
    await tx.clinicalNote.create({ data: { workspaceId: ctx.workspace.id, patientId: plan.patientId, professionalId, noteType: "evolucao", contentMarkdown: evolution } });
    if (item.tooth && item.toothResult && isToothResult(item.toothResult)) {
      const status = statusAfter(item.toothResult);
      await tx.toothRecord.upsert({
        where: { patientId_tooth: { patientId: plan.patientId, tooth: item.tooth } },
        create: { workspaceId: ctx.workspace.id, patientId: plan.patientId, tooth: item.tooth, status, faces: item.faces, updatedById: ctx.user.id },
        update: { status, faces: item.faces, updatedById: ctx.user.id },
      });
    }
    if (item.returnMonths) {
      const reason = recallReasonFor(proc?.specialty ?? "");
      const exists = await tx.recall.findFirst({ where: { workspaceId: ctx.workspace.id, patientId: plan.patientId, reason, status: "pendente" }, select: { id: true } });
      if (!exists)
        await tx.recall.create({
          data: { workspaceId: ctx.workspace.id, patientId: plan.patientId, reason, planId: plan.id, dueDate: parseDateOnly(addMonthsKey(dateKeySP(now), item.returnMonths)) },
        });
    }
    const items = await tx.treatmentItem.findMany({ where: { planId: plan.id }, select: { status: true } });
    if (planShouldConclude(items)) await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: "concluido" } });
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.item.done", entity: "TreatmentItem", entityId: item.id, metadata: { tooth: item.tooth } });
  revalidatePath(path(plan.id));
  // O botão "Realizado" some com o item feito: a confirmação vai pela URL.
  redirect(`${path(plan.id)}?feito=${item.id}`);
}

// Item que não será feito (plano aprovado): decisão clínica ou de quem administra as finanças. As parcelas não mudam
// sozinhas (o ajuste fica em Cobranças). Se nenhum item foi feito e todos saíram, o plano é cancelado com as parcelas
// em aberto, desde que nenhuma tenha sido paga.
export async function cancelItemAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", (c) => canClinicalWrite(c) || canApprovePlans(c));
  const plan = await findPlan(ctx, str(fd, "planId"));
  if (plan.status !== "aprovado") return err("notApproved");
  const res = await db.treatmentItem.updateMany({ where: { id: str(fd, "itemId"), planId: plan.id, status: "planejado" }, data: { status: "cancelado" } });
  if (!res.count) return err("generic");
  const items = await db.treatmentItem.findMany({ where: { planId: plan.id }, select: { status: true } });
  if (planShouldConclude(items)) await db.treatmentPlan.update({ where: { id: plan.id }, data: { status: "concluido" } });
  else if (items.every((i) => i.status === "cancelado") && !plan.charges.some((c) => c.status === "paid")) {
    await db.$transaction([
      db.treatmentPlan.update({ where: { id: plan.id }, data: { status: "cancelado" } }),
      db.charge.updateMany({ where: { treatmentPlanId: plan.id, workspaceId: ctx.workspace.id, status: { in: ["pending", "overdue"] } }, data: { status: "cancelled" } }),
    ]);
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.item.cancel", entity: "TreatmentItem", entityId: str(fd, "itemId") });
  revalidatePath(path(plan.id));
  redirect(`${path(plan.id)}?naofeito=1`);
}
