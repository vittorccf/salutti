"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { onlyDigits, parseBoleto } from "@/lib/boleto";
import { readAttachmentUpload, UploadError } from "@/lib/media";
import { media } from "@/lib/providers/media";
import {
  adjustToBusinessDay,
  ATTACHMENT_KINDS,
  CATEGORY_GROUPS,
  FREQUENCIES,
  MAX_OCCURRENCES,
  PAYMENT_METHODS,
  WEEKEND_RULES,
  addMonthsKey,
  occurrenceDate,
  parseMoneyToCents,
  principalFromPaid,
  seriesDates,
  shiftCompetence,
  splitInstallments,
  type Frequency,
  type WeekendRule,
} from "@/lib/payables";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { requirePayables } from "./_lib";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optional = (fd: FormData, key: string) => str(fd, key) || null;
const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonthKey = (v: string) => /^\d{4}-\d{2}$/.test(v);
const oneOf = <T extends readonly string[]>(list: T, v: string): v is T[number] => (list as readonly string[]).includes(v);
const PATH = "/app/financeiro/pagar";

class PayableError extends Error {}

async function fail(e: unknown): Promise<FormResult> {
  const t = await getTranslations("payables.errors");
  if (e instanceof PayableError || e instanceof UploadError) return { erro: t.has(e.message) ? t(e.message) : t("generic") };
  // Posição repetida na série (dois "Gerar as próximas" ao mesmo tempo).
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { erro: t("seriesConflict") };
  throw e;
}

// Cliente da transação do `db` estendido (src/lib/db.ts), não o TransactionClient padrão.
type Tx = Omit<typeof db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Trava as contas durante a leitura do saldo: pagamento, estorno e cancelamento simultâneos não se atropelam.
const lock = (tx: Tx, workspaceId: string, ids: string[]) =>
  tx.$executeRaw`SELECT 1 FROM "Payable" WHERE "id" = ANY(${ids}) AND "workspaceId" = ${workspaceId} FOR UPDATE`;

// Categoria e fornecedor do consultório. Categoria desativada só vale se já for a da conta (edição).
// Fornecedor novo digitado no formulário só é validado aqui; é criado junto com a conta, na mesma transação.
async function resolveRefs(workspaceId: string, fd: FormData, currentCategoryId?: string) {
  const categoryId = str(fd, "categoryId");
  const category = await db.financeCategory.findFirst({
    where: { id: categoryId, workspaceId, ...(categoryId === currentCategoryId ? {} : { active: true }) },
    select: { id: true },
  });
  if (!category) throw new PayableError("categoryRequired");
  const supplierId = optional(fd, "supplierId");
  if (supplierId === "__new") {
    const name = str(fd, "newSupplierName");
    if (name.length < 2 || name.length > 120) throw new PayableError("supplierNameRequired");
    return { categoryId: category.id, supplierId: null, newSupplierName: name };
  }
  if (supplierId && !(await db.supplier.count({ where: { id: supplierId, workspaceId } }))) throw new PayableError("supplierInvalid");
  return { categoryId: category.id, supplierId, newSupplierName: null };
}

async function createSupplierIfNew(tx: Tx, workspaceId: string, refs: Awaited<ReturnType<typeof resolveRefs>>) {
  if (!refs.newSupplierName) return refs.supplierId;
  return (await tx.supplier.create({ data: { workspaceId, name: refs.newSupplierName, defaultCategoryId: refs.categoryId } })).id;
}

// Campos comuns de lançamento e edição.
function readCommon(fd: FormData) {
  const description = str(fd, "description");
  if (description.length < 2 || description.length > 140) throw new PayableError("descriptionRequired");
  const amountCents = parseMoneyToCents(str(fd, "amount"));
  if (!amountCents || amountCents <= 0 || amountCents > 100_000_000_00) throw new PayableError("amountInvalid");
  const method = str(fd, "method");
  if (method && !oneOf(PAYMENT_METHODS, method)) throw new PayableError("methodInvalid");
  const barcodeRaw = str(fd, "barcode");
  let barcode: string | null = null;
  if (barcodeRaw) {
    const parsed = parseBoleto(barcodeRaw, dateKeySP());
    if (typeof parsed === "string") throw new PayableError(parsed === "length" ? "barcodeLength" : "barcodeCheckDigit");
    barcode = onlyDigits(barcodeRaw);
  }
  return {
    description,
    amountCents,
    method: method || null,
    documentNumber: optional(fd, "documentNumber"),
    barcode,
    pixCopyPaste: optional(fd, "pixCopyPaste"),
    costCenter: optional(fd, "costCenter"),
    notes: optional(fd, "notes"),
    deductible: fd.get("deductible") === "on",
  };
}

// Data de pagamento: válida e não futura.
function readPaidAt(fd: FormData, key = "paidAt") {
  const paidAt = str(fd, key) || dateKeySP();
  if (!isDateKey(paidAt) || paidAt > dateKeySP()) throw new PayableError("paidAtInvalid");
  return paidAt;
}

type Upload = Awaited<ReturnType<typeof readAttachmentUpload>>;

// O arquivo é lido e validado antes de gravar qualquer coisa; aqui só é guardado.
async function storeAttachment(workspaceId: string, payableId: string, file: Upload, kind: string) {
  if (!file) return null;
  const mediaId = await media.save("payable_attachment", { workspaceId }, file);
  return db.payableAttachment.create({
    data: { workspaceId, payableId, mediaId, kind: oneOf(ATTACHMENT_KINDS, kind) ? kind : "outro", fileName: file.fileName },
  });
}

export async function createPayableAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  let firstId: string;
  try {
    // 1) Tudo validado antes de gravar: um erro não deixa série, fornecedor ou pagamento pela metade.
    const common = readCommon(fd);
    const refs = await resolveRefs(workspaceId, fd);
    const due = str(fd, "dueDate");
    if (!isDateKey(due)) throw new PayableError("dueDateRequired");
    const competence = str(fd, "competence") || due.slice(0, 7);
    if (!isMonthKey(competence)) throw new PayableError("competenceInvalid");
    const weekendRule = (oneOf(WEEKEND_RULES, str(fd, "weekendRule")) ? str(fd, "weekendRule") : "keep") as WeekendRule;
    const alreadyPaid = fd.get("alreadyPaid") === "on";
    const paidAt = alreadyPaid ? readPaidAt(fd) : null;
    const attachment = await readAttachmentUpload(fd, "attachment");

    // Ocorrências: única, parcelada (valor total dividido) ou recorrente (mesmo valor em cada uma).
    const repeat = str(fd, "repeat");
    let occurrences: { due: string; competence: string; amountCents: number }[];
    let series: { frequency: Frequency | null; installmentTotal: number | null; openEnded: boolean } = { frequency: null, installmentTotal: null, openEnded: false };
    if (repeat === "installments") {
      const n = Number(str(fd, "installments"));
      if (!Number.isInteger(n) || n < 2 || n > MAX_OCCURRENCES) throw new PayableError("installmentsInvalid");
      const frequency = oneOf(FREQUENCIES, str(fd, "frequency")) ? (str(fd, "frequency") as Frequency) : "monthly";
      const amounts = splitInstallments(common.amountCents, n);
      // Parcelas de uma compra: a competência é a da compra; só o vencimento anda.
      occurrences = seriesDates(due, frequency, { count: n }).map((d, i) => ({ due: d, competence, amountCents: amounts[i] }));
      series = { frequency, installmentTotal: n, openEnded: false };
    } else if (repeat === "recurring") {
      const frequency = str(fd, "frequency");
      if (!oneOf(FREQUENCIES, frequency)) throw new PayableError("frequencyInvalid");
      const end = str(fd, "recurrenceEnd");
      const until = str(fd, "until");
      const count = Number(str(fd, "count"));
      let dates: string[];
      if (end === "until") {
        if (!isDateKey(until) || until < due) throw new PayableError("untilInvalid");
        dates = seriesDates(due, frequency, { until });
      } else if (end === "count") {
        if (!Number.isInteger(count) || count < 2 || count > MAX_OCCURRENCES) throw new PayableError("countInvalid");
        dates = seriesDates(due, frequency, { count });
      } else {
        // Sem fim: os próximos 12 meses agora; a tela da conta gera mais quando a série estiver acabando.
        dates = seriesDates(due, frequency, { until: addMonthsKey(due, 11) });
      }
      // Conta recorrente (aluguel, internet): cada ocorrência é da competência do seu mês.
      occurrences = dates.map((d) => ({ due: d, competence: shiftCompetence(competence, due, d), amountCents: common.amountCents }));
      series = { frequency, installmentTotal: null, openEnded: end !== "until" && end !== "count" };
    } else {
      occurrences = [{ due, competence, amountCents: common.amountCents }];
    }

    // 2) Gravação: fornecedor novo, contas e o pagamento da primeira na mesma transação.
    const seriesId = occurrences.length > 1 ? randomUUID() : null;
    firstId = await db.$transaction(async (tx) => {
      const supplierId = await createSupplierIfNew(tx, workspaceId, refs);
      const ids: string[] = [];
      for (const [i, o] of occurrences.entries()) {
        const created = await tx.payable.create({
          data: {
            workspaceId,
            ...common,
            categoryId: refs.categoryId,
            supplierId,
            amountCents: o.amountCents,
            // Ajuste de fim de semana/feriado vale para todas, inclusive a primeira data digitada.
            dueDate: parseDateOnly(adjustToBusinessDay(o.due, weekendRule)),
            competenceDate: parseDateOnly(`${o.competence}-01`),
            barcode: i === 0 ? common.barcode : null,
            pixCopyPaste: i === 0 ? common.pixCopyPaste : null,
            documentNumber: i === 0 || series.installmentTotal ? common.documentNumber : null,
            seriesId,
            seriesIndex: seriesId ? i + 1 : null,
            installmentTotal: series.installmentTotal,
            frequency: series.frequency,
            anchorDate: seriesId ? parseDateOnly(due) : null,
            weekendRule: seriesId ? weekendRule : null,
            seriesOpenEnded: series.openEnded,
            paidCents: i === 0 && paidAt ? o.amountCents : 0,
            createdById: ctx.user.id,
          },
          select: { id: true },
        });
        ids.push(created.id);
      }
      if (paidAt) {
        await tx.payablePayment.create({
          data: { workspaceId, payableId: ids[0], paidAt: parseDateOnly(paidAt), principalCents: occurrences[0].amountCents, method: common.method, createdById: ctx.user.id },
        });
      }
      return ids[0];
    });

    await storeAttachment(workspaceId, firstId, attachment, str(fd, "attachmentKind"));
    await recordAudit({
      workspaceId,
      userId: ctx.user.id,
      action: "payable.create",
      entity: "Payable",
      entityId: firstId,
      metadata: { occurrences: occurrences.length, repeat: repeat || "none", amountCents: common.amountCents },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  redirect(`${PATH}/${firstId}`);
}

async function loadOwned(workspaceId: string, id: string) {
  const p = await db.payable.findFirst({ where: { id, workspaceId } });
  if (!p) throw new PayableError("notFound");
  return p;
}

type Owned = Awaited<ReturnType<typeof loadOwned>>;

// Ocorrências de "só esta" ou "esta e as próximas" (as próximas: mesma série, posição maior).
// `open`: só as sem pagamento e não canceladas (editar, cancelar); senão, as canceladas (reabrir).
async function scopeTargets(workspaceId: string, p: Owned, scope: string, mode: "open" | "cancelled" = "open") {
  if (scope !== "following" || !p.seriesId || p.seriesIndex === null) return [p];
  const rest = await db.payable.findMany({
    where: {
      workspaceId,
      seriesId: p.seriesId,
      seriesIndex: { gt: p.seriesIndex },
      ...(mode === "open" ? { cancelledAt: null, paidCents: 0 } : { cancelledAt: { not: null } }),
    },
  });
  return [p, ...rest];
}

export async function updatePayableAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const id = str(fd, "id");
  try {
    const p = await loadOwned(workspaceId, id);
    if (p.cancelledAt) throw new PayableError("cancelled");
    const common = readCommon(fd);
    const refs = await resolveRefs(workspaceId, fd, p.categoryId);
    const due = str(fd, "dueDate");
    const competence = str(fd, "competence");
    if (!isDateKey(due)) throw new PayableError("dueDateRequired");
    if (!isMonthKey(competence)) throw new PayableError("competenceInvalid");
    if (common.amountCents < p.paidCents) throw new PayableError("amountBelowPaid");

    const scope = str(fd, "scope");
    const targets = await scopeTargets(workspaceId, p, scope);
    const sameAmountForFollowing = !p.installmentTotal;
    await db.$transaction(async (tx) => {
      const supplierId = await createSupplierIfNew(tx, workspaceId, refs);
      // Nas próximas vão os dados de cadastro e o valor; vencimento, competência, boleto e Pix são só desta.
      const shared = {
        description: common.description,
        method: common.method,
        costCenter: common.costCenter,
        notes: common.notes,
        deductible: common.deductible,
        categoryId: refs.categoryId,
        supplierId,
      };
      await tx.payable.update({
        where: { id: p.id },
        data: {
          ...shared,
          amountCents: common.amountCents,
          dueDate: parseDateOnly(due),
          competenceDate: parseDateOnly(`${competence}-01`),
          documentNumber: common.documentNumber,
          barcode: common.barcode,
          pixCopyPaste: common.pixCopyPaste,
        },
      });
      const others = targets.filter((t) => t.id !== p.id).map((t) => t.id);
      if (others.length) {
        await tx.payable.updateMany({
          where: { id: { in: others }, workspaceId },
          data: { ...shared, ...(sameAmountForFollowing ? { amountCents: common.amountCents } : {}) },
        });
      }
    });
    await recordAudit({
      workspaceId,
      userId: ctx.user.id,
      action: "payable.update",
      entity: "Payable",
      entityId: p.id,
      metadata: { scope: scope === "following" ? "following" : "one", affected: targets.length, from: { amountCents: p.amountCents }, to: { amountCents: common.amountCents } },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  redirect(`${PATH}/${id}`);
}

export async function cancelPayableAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  try {
    const p = await loadOwned(workspaceId, str(fd, "id"));
    const targets = await scopeTargets(workspaceId, p, str(fd, "scope"));
    const ids = targets.map((t) => t.id);
    await db.$transaction(async (tx) => {
      await lock(tx, workspaceId, ids);
      // Conferido com a conta travada: um pagamento que chegue junto não cai numa conta cancelada.
      const paid = await tx.payable.count({ where: { id: p.id, paidCents: { gt: 0 } } });
      if (paid) throw new PayableError("cancelHasPayments");
      await tx.payable.updateMany({
        where: { id: { in: ids }, workspaceId, cancelledAt: null, paidCents: 0 },
        data: { cancelledAt: new Date(), cancelReason: optional(fd, "reason") },
      });
    });
    await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.cancel", entity: "Payable", entityId: p.id, metadata: { affected: ids.length } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("cancelled") };
}

export async function reopenPayableAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  try {
    const p = await loadOwned(workspaceId, str(fd, "id"));
    const targets = await scopeTargets(workspaceId, p, str(fd, "scope"), "cancelled");
    await db.payable.updateMany({ where: { id: { in: targets.map((t) => t.id) }, workspaceId }, data: { cancelledAt: null, cancelReason: null } });
    await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.reopen", entity: "Payable", entityId: p.id, metadata: { affected: targets.length } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("reopened") };
}

const cents = (fd: FormData, key: string) => {
  const raw = str(fd, key);
  if (!raw) return 0;
  const v = parseMoneyToCents(raw);
  if (v === null || v < 0) throw new PayableError("chargesInvalid");
  return v;
};

export async function registerPaymentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const id = str(fd, "id");
  try {
    const paidAt = readPaidAt(fd);
    const paid = parseMoneyToCents(str(fd, "paidAmount"));
    if (!paid || paid <= 0) throw new PayableError("amountInvalid");
    const interest = cents(fd, "interest");
    const fine = cents(fd, "fine");
    const discount = cents(fd, "discount");
    const principal = principalFromPaid(paid, interest, fine, discount);
    if (principal <= 0) throw new PayableError("principalInvalid");
    const method = str(fd, "method");
    // Comprovante validado antes: arquivo recusado não deixa o pagamento gravado.
    const receipt = await readAttachmentUpload(fd, "receipt");
    // Trava a conta durante a conferência do saldo: dois envios ao mesmo tempo não pagam além do valor.
    const payment = await db.$transaction(async (tx) => {
      await lock(tx, workspaceId, [id]);
      const p = await tx.payable.findFirst({ where: { id, workspaceId } });
      if (!p) throw new PayableError("notFound");
      if (p.cancelledAt) throw new PayableError("cancelled");
      if (principal > p.amountCents - p.paidCents) throw new PayableError("paymentAboveRemaining");
      await tx.payable.update({ where: { id: p.id }, data: { paidCents: { increment: principal } } });
      return tx.payablePayment.create({
        data: {
          workspaceId,
          payableId: p.id,
          paidAt: parseDateOnly(paidAt),
          principalCents: principal,
          interestCents: interest,
          fineCents: fine,
          discountCents: discount,
          method: oneOf(PAYMENT_METHODS, method) ? method : p.method,
          notes: optional(fd, "notes"),
          createdById: ctx.user.id,
        },
      });
    });
    await storeAttachment(workspaceId, id, receipt, "comprovante");
    await recordAudit({
      workspaceId,
      userId: ctx.user.id,
      action: "payable.pay",
      entity: "Payable",
      entityId: id,
      metadata: { paymentId: payment.id, principal, interest, fine, discount },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("paymentRegistered") };
}

// Pagar várias de uma vez pela lista: baixa do saldo de cada uma, na mesma data e forma.
export async function bulkPayAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const t = await getTranslations("payables.list");
  const ids = fd.getAll("ids").map(String).slice(0, 200);
  if (!ids.length) return { erro: t("bulkNone") };
  let paidAt: string;
  try {
    paidAt = readPaidAt(fd);
  } catch (e) {
    return fail(e);
  }
  const method = str(fd, "method");
  const toPay = await db.$transaction(async (tx) => {
    await lock(tx, workspaceId, ids);
    const rows = await tx.payable.findMany({ where: { id: { in: ids }, workspaceId, cancelledAt: null } });
    const open = rows.map((r) => ({ r, remaining: r.amountCents - r.paidCents })).filter((x) => x.remaining > 0);
    for (const { r, remaining } of open) {
      await tx.payable.update({ where: { id: r.id }, data: { paidCents: r.amountCents } });
      await tx.payablePayment.create({
        data: {
          workspaceId,
          payableId: r.id,
          paidAt: parseDateOnly(paidAt),
          principalCents: remaining,
          method: oneOf(PAYMENT_METHODS, method) ? method : r.method,
          createdById: ctx.user.id,
        },
      });
    }
    return open;
  });
  await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.bulk-pay", entity: "Payable", entityId: "lote", metadata: { count: toPay.length } });
  revalidatePath(PATH);
  return { ok: t("bulkDone", { count: toPay.length }) };
}

export async function reversePaymentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const paymentId = str(fd, "paymentId");
  try {
    await db.$transaction(async (tx) => {
      const pay = await tx.payablePayment.findFirst({ where: { id: paymentId, workspaceId, reversedAt: null } });
      if (!pay) throw new PayableError("notFound");
      await lock(tx, workspaceId, [pay.payableId]);
      const res = await tx.payablePayment.updateMany({ where: { id: pay.id, reversedAt: null }, data: { reversedAt: new Date() } });
      if (!res.count) throw new PayableError("notFound");
      await tx.payable.update({ where: { id: pay.payableId }, data: { paidCents: { decrement: pay.principalCents } } });
    });
  } catch (e) {
    return fail(e);
  }
  await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.reverse", entity: "PayablePayment", entityId: paymentId });
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("paymentReversed") };
}

export async function addAttachmentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  try {
    const p = await loadOwned(ctx.workspace.id, str(fd, "id"));
    const file = await readAttachmentUpload(fd, "file");
    if (!file) throw new PayableError("attachmentMissing");
    const att = await storeAttachment(ctx.workspace.id, p.id, file, str(fd, "kind"));
    await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "payable.attach", entity: "Payable", entityId: p.id, metadata: { kind: att?.kind } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("attachmentAdded") };
}

export async function removeAttachmentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const att = await db.payableAttachment.findFirst({ where: { id: str(fd, "attachmentId"), workspaceId: ctx.workspace.id } });
  if (!att) return fail(new PayableError("notFound"));
  await db.payableAttachment.delete({ where: { id: att.id } });
  await media.remove(att.mediaId);
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "payable.detach", entity: "Payable", entityId: att.payableId, metadata: { kind: att.kind } });
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("attachmentRemoved") };
}

// Série recorrente sem fim: gera as próximas ocorrências a partir da última, pelo dia âncora (a data digitada,
// antes do ajuste de fim de semana) e com a mesma regra de fim de semana/feriado.
export async function extendSeriesAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const seriesId = str(fd, "seriesId");
  let added = 0;
  try {
    await db.$transaction(async (tx) => {
      const first = await tx.payable.findFirst({ where: { workspaceId, seriesId }, orderBy: { seriesIndex: "asc" } });
      if (!first) throw new PayableError("notFound");
      // Trava a primeira da série: dois cliques ao mesmo tempo não geram a mesma posição duas vezes.
      await lock(tx, workspaceId, [first.id]);
      const last = await tx.payable.findFirst({ where: { workspaceId, seriesId }, orderBy: { seriesIndex: "desc" } });
      if (!last || !first.seriesOpenEnded || !first.frequency || !oneOf(FREQUENCIES, first.frequency)) throw new PayableError("seriesNotExtendable");
      // Série encerrada (cancelada desta em diante) não volta a crescer.
      if (last.cancelledAt) throw new PayableError("seriesEnded");
      const frequency = first.frequency as Frequency;
      const anchor = dateKeySP(first.anchorDate ?? first.dueDate);
      const firstComp = dateKeySP(first.competenceDate).slice(0, 7);
      const rule = (oneOf(WEEKEND_RULES, first.weekendRule ?? "") ? first.weekendRule : "keep") as WeekendRule;
      const start = last.seriesIndex ?? 1;
      const count = frequency === "weekly" ? 52 : frequency === "biweekly" ? 26 : 12;
      for (let k = 0; k < count; k++) {
        const index = start + k; // posição 0-based da próxima ocorrência
        const due = occurrenceDate(anchor, frequency, index);
        await tx.payable.create({
          data: {
            workspaceId,
            description: last.description,
            supplierId: last.supplierId,
            categoryId: last.categoryId,
            amountCents: last.amountCents,
            method: last.method,
            costCenter: last.costCenter,
            notes: last.notes,
            deductible: last.deductible,
            dueDate: parseDateOnly(adjustToBusinessDay(due, rule)),
            competenceDate: parseDateOnly(`${shiftCompetence(firstComp, anchor, due)}-01`),
            seriesId,
            seriesIndex: index + 1,
            frequency,
            anchorDate: first.anchorDate,
            weekendRule: rule,
            seriesOpenEnded: true,
            createdById: ctx.user.id,
          },
        });
      }
      added = count;
    });
  } catch (e) {
    return fail(e);
  }
  await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.extend", entity: "Payable", entityId: seriesId, metadata: { added } });
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("seriesExtended", { count: added }) };
}

// ----------------------------- Fornecedores -----------------------------

export async function saveSupplierAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const t = await getTranslations("payables.errors");
  const id = optional(fd, "id");
  const name = str(fd, "name");
  if (name.length < 2 || name.length > 120) return { erro: t("supplierNameRequired") };
  const document = onlyDigits(str(fd, "document"));
  if (document && document.length !== 11 && document.length !== 14) return { erro: t("documentInvalid") };
  const defaultCategoryId = optional(fd, "defaultCategoryId");
  if (defaultCategoryId && !(await db.financeCategory.count({ where: { id: defaultCategoryId, workspaceId } }))) return { erro: t("categoryRequired") };
  const data = {
    name,
    document: document || null,
    email: optional(fd, "email"),
    phone: optional(fd, "phone"),
    pixKey: optional(fd, "pixKey"),
    notes: optional(fd, "notes"),
    defaultCategoryId,
    active: id ? fd.get("active") === "on" : true,
  };
  if (id) {
    const res = await db.supplier.updateMany({ where: { id, workspaceId }, data });
    if (!res.count) return { erro: t("notFound") };
  } else {
    await db.supplier.create({ data: { ...data, workspaceId } });
  }
  await recordAudit({ workspaceId, userId: ctx.user.id, action: id ? "supplier.update" : "supplier.create", entity: "Supplier", entityId: id ?? name });
  revalidatePath(`${PATH}/fornecedores`);
  const tl = await getTranslations("payables.suppliers");
  return { ok: tl("saved", { name }) };
}

// ----------------------------- Plano de contas -----------------------------

export async function saveCategoryAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const t = await getTranslations("payables.errors");
  const id = optional(fd, "id");
  const name = str(fd, "name");
  const group = str(fd, "group");
  if (name.length < 2 || name.length > 80) return { erro: t("categoryNameRequired") };
  if (!oneOf(CATEGORY_GROUPS, group)) return { erro: t("groupInvalid") };
  const data = { name, group, deductible: fd.get("deductible") === "on", active: id ? fd.get("active") === "on" : true };
  if (id) {
    const res = await db.financeCategory.updateMany({ where: { id, workspaceId }, data });
    if (!res.count) return { erro: t("notFound") };
  } else {
    await db.financeCategory.create({ data: { ...data, workspaceId } });
  }
  await recordAudit({ workspaceId, userId: ctx.user.id, action: id ? "finance-category.update" : "finance-category.create", entity: "FinanceCategory", entityId: id ?? name });
  revalidatePath(`${PATH}/categorias`);
  const tl = await getTranslations("payables.categories");
  return { ok: tl("saved", { name }) };
}
