"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  paidPrincipal,
  parseMoneyToCents,
  principalFromPaid,
  seriesDates,
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
  throw e;
}

// Categoria e fornecedor precisam ser do consultório; fornecedor novo digitado no formulário é criado na hora.
async function resolveRefs(workspaceId: string, fd: FormData) {
  const categoryId = str(fd, "categoryId");
  const category = await db.financeCategory.findFirst({ where: { id: categoryId, workspaceId }, select: { id: true } });
  if (!category) throw new PayableError("categoryRequired");
  let supplierId = optional(fd, "supplierId");
  if (supplierId === "__new") {
    const name = str(fd, "newSupplierName");
    if (name.length < 2) throw new PayableError("supplierNameRequired");
    supplierId = (await db.supplier.create({ data: { workspaceId, name, defaultCategoryId: category.id } })).id;
  } else if (supplierId) {
    const ok = await db.supplier.count({ where: { id: supplierId, workspaceId } });
    if (!ok) throw new PayableError("supplierInvalid");
  }
  return { categoryId: category.id, supplierId };
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

async function saveAttachment(workspaceId: string, payableId: string, fd: FormData, field: string, kind: string) {
  const file = await readAttachmentUpload(fd, field);
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
    const common = readCommon(fd);
    const refs = await resolveRefs(workspaceId, fd);
    const due = str(fd, "dueDate");
    if (!isDateKey(due)) throw new PayableError("dueDateRequired");
    const competence = str(fd, "competence") || due.slice(0, 7);
    if (!isMonthKey(competence)) throw new PayableError("competenceInvalid");
    const weekendRule = (oneOf(WEEKEND_RULES, str(fd, "weekendRule")) ? str(fd, "weekendRule") : "keep") as WeekendRule;

    // Ocorrências: única, parcelada (valor total dividido) ou recorrente (mesmo valor em cada uma).
    const repeat = str(fd, "repeat");
    let occurrences: { due: string; competence: string; amountCents: number }[];
    let series: { frequency: Frequency | null; installmentTotal: number | null } = { frequency: null, installmentTotal: null };
    if (repeat === "installments") {
      const n = Number(str(fd, "installments"));
      if (!Number.isInteger(n) || n < 2 || n > MAX_OCCURRENCES) throw new PayableError("installmentsInvalid");
      const frequency = oneOf(FREQUENCIES, str(fd, "frequency")) ? (str(fd, "frequency") as Frequency) : "monthly";
      const amounts = splitInstallments(common.amountCents, n);
      // Parcelas de uma compra: a competência é a da compra; só o vencimento anda.
      occurrences = seriesDates(due, frequency, { count: n }).map((d, i) => ({ due: d, competence, amountCents: amounts[i] }));
      series = { frequency, installmentTotal: n };
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
      const offset = (d: string) => {
        const [y, m] = competence.split("-").map(Number);
        const [dy, dm] = d.split("-").map(Number);
        const [fy, fm] = due.split("-").map(Number);
        const shift = (dy - fy) * 12 + (dm - fm);
        const total = y * 12 + (m - 1) + shift;
        return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
      };
      // Conta recorrente (aluguel, internet): cada ocorrência é da competência do seu mês.
      occurrences = dates.map((d) => ({ due: d, competence: offset(d), amountCents: common.amountCents }));
      series = { frequency, installmentTotal: null };
    } else {
      occurrences = [{ due, competence, amountCents: common.amountCents }];
    }

    const seriesId = occurrences.length > 1 ? randomUUID() : null;
    const created = await db.$transaction(
      occurrences.map((o, i) =>
        db.payable.create({
          data: {
            workspaceId,
            ...common,
            ...refs,
            amountCents: o.amountCents,
            // Ajuste de fim de semana/feriado vale para a série; a primeira data digitada também passa pela regra.
            dueDate: parseDateOnly(adjustToBusinessDay(o.due, weekendRule)),
            competenceDate: parseDateOnly(`${o.competence}-01`),
            barcode: i === 0 ? common.barcode : null,
            pixCopyPaste: i === 0 ? common.pixCopyPaste : null,
            documentNumber: i === 0 || series.installmentTotal ? common.documentNumber : null,
            seriesId,
            seriesIndex: seriesId ? i + 1 : null,
            installmentTotal: series.installmentTotal,
            frequency: series.frequency,
            createdById: ctx.user.id,
          },
          select: { id: true },
        }),
      ),
    );
    firstId = created[0].id;

    await saveAttachment(workspaceId, firstId, fd, "attachment", str(fd, "attachmentKind"));

    // "Já está paga": baixa da primeira ocorrência no valor cheio.
    if (fd.get("alreadyPaid") === "on") {
      const paidAt = str(fd, "paidAt") || dateKeySP();
      if (!isDateKey(paidAt)) throw new PayableError("paidAtInvalid");
      await db.payablePayment.create({
        data: {
          workspaceId,
          payableId: firstId,
          paidAt: parseDateOnly(paidAt),
          principalCents: occurrences[0].amountCents,
          method: common.method,
          createdById: ctx.user.id,
        },
      });
    }

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
  const p = await db.payable.findFirst({ where: { id, workspaceId }, include: { payments: true } });
  if (!p) throw new PayableError("notFound");
  return p;
}

// Ocorrências afetadas por "só esta" ou "esta e as próximas" (as próximas: mesma série, em aberto e não canceladas).
async function scopeTargets(workspaceId: string, p: Awaited<ReturnType<typeof loadOwned>>, scope: string) {
  if (scope !== "following" || !p.seriesId || p.seriesIndex === null) return [p];
  const rest = await db.payable.findMany({
    where: { workspaceId, seriesId: p.seriesId, seriesIndex: { gt: p.seriesIndex }, cancelledAt: null },
    include: { payments: true },
  });
  return [p, ...rest.filter((r) => paidPrincipal(r.payments) === 0)];
}

export async function updatePayableAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const id = str(fd, "id");
  try {
    const p = await loadOwned(workspaceId, id);
    if (p.cancelledAt) throw new PayableError("cancelled");
    const common = readCommon(fd);
    const refs = await resolveRefs(workspaceId, fd);
    const due = str(fd, "dueDate");
    const competence = str(fd, "competence");
    if (!isDateKey(due)) throw new PayableError("dueDateRequired");
    if (!isMonthKey(competence)) throw new PayableError("competenceInvalid");
    if (common.amountCents < paidPrincipal(p.payments)) throw new PayableError("amountBelowPaid");

    const scope = str(fd, "scope");
    const targets = await scopeTargets(workspaceId, p, scope);
    // Nas próximas vão os dados de cadastro e o valor; vencimento, competência, boleto e Pix são só desta.
    const shared = {
      description: common.description,
      method: common.method,
      costCenter: common.costCenter,
      notes: common.notes,
      deductible: common.deductible,
      ...refs,
    };
    const sameAmountForFollowing = !p.installmentTotal;
    await db.$transaction([
      db.payable.update({
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
      }),
      ...targets
        .filter((t) => t.id !== p.id)
        .map((t) =>
          db.payable.update({ where: { id: t.id }, data: { ...shared, ...(sameAmountForFollowing ? { amountCents: common.amountCents } : {}) } }),
        ),
    ]);
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
    if (paidPrincipal(p.payments) > 0) throw new PayableError("cancelHasPayments");
    const targets = await scopeTargets(workspaceId, p, str(fd, "scope"));
    const reason = optional(fd, "reason");
    await db.payable.updateMany({
      where: { id: { in: targets.map((t) => t.id) }, workspaceId, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelReason: reason },
    });
    await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.cancel", entity: "Payable", entityId: p.id, metadata: { affected: targets.length } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("cancelled") };
}

export async function reopenPayableAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const id = str(fd, "id");
  const res = await db.payable.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data: { cancelledAt: null, cancelReason: null } });
  if (!res.count) return fail(new PayableError("notFound"));
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "payable.reopen", entity: "Payable", entityId: id });
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
    const paidAt = str(fd, "paidAt");
    if (!isDateKey(paidAt) || paidAt > dateKeySP()) throw new PayableError("paidAtInvalid");
    const paid = parseMoneyToCents(str(fd, "paidAmount"));
    if (!paid || paid <= 0) throw new PayableError("amountInvalid");
    const interest = cents(fd, "interest");
    const fine = cents(fd, "fine");
    const discount = cents(fd, "discount");
    const principal = principalFromPaid(paid, interest, fine, discount);
    if (principal <= 0) throw new PayableError("principalInvalid");
    const method = str(fd, "method");
    // Trava a conta durante a conferência do saldo: dois envios ao mesmo tempo não pagam além do valor.
    const { p, payment } = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Payable" WHERE "id" = ${id} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
      const p = await tx.payable.findFirst({ where: { id, workspaceId }, include: { payments: true } });
      if (!p) throw new PayableError("notFound");
      if (p.cancelledAt) throw new PayableError("cancelled");
      if (principal > p.amountCents - paidPrincipal(p.payments)) throw new PayableError("paymentAboveRemaining");
      const payment = await tx.payablePayment.create({
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
      return { p, payment };
    });
    await saveAttachment(workspaceId, p.id, fd, "receipt", "comprovante");
    await recordAudit({
      workspaceId,
      userId: ctx.user.id,
      action: "payable.pay",
      entity: "Payable",
      entityId: p.id,
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
  const paidAt = str(fd, "paidAt") || dateKeySP();
  if (!ids.length) return { erro: t("bulkNone") };
  if (!isDateKey(paidAt) || paidAt > dateKeySP()) return fail(new PayableError("paidAtInvalid"));
  const method = str(fd, "method");
  // Mesma trava do pagamento individual: o saldo é lido com as contas travadas.
  const toPay = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Payable" WHERE "id" = ANY(${ids}) AND "workspaceId" = ${workspaceId} FOR UPDATE`;
    const rows = await tx.payable.findMany({ where: { id: { in: ids }, workspaceId, cancelledAt: null }, include: { payments: true } });
    const open = rows.map((r) => ({ r, remaining: r.amountCents - paidPrincipal(r.payments) })).filter((x) => x.remaining > 0);
    await tx.payablePayment.createMany({
      data: open.map(({ r, remaining }) => ({
        workspaceId,
        payableId: r.id,
        paidAt: parseDateOnly(paidAt),
        principalCents: remaining,
        method: oneOf(PAYMENT_METHODS, method) ? method : r.method,
        createdById: ctx.user.id,
      })),
    });
    return open;
  });
  await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.bulk-pay", entity: "Payable", entityId: "lote", metadata: { count: toPay.length } });
  revalidatePath(PATH);
  return { ok: t("bulkDone", { count: toPay.length }) };
}

export async function reversePaymentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const paymentId = str(fd, "paymentId");
  const res = await db.payablePayment.updateMany({ where: { id: paymentId, workspaceId: ctx.workspace.id, reversedAt: null }, data: { reversedAt: new Date() } });
  if (!res.count) return fail(new PayableError("notFound"));
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "payable.reverse", entity: "PayablePayment", entityId: paymentId });
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("paymentReversed") };
}

export async function addAttachmentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  try {
    const p = await loadOwned(ctx.workspace.id, str(fd, "id"));
    const att = await saveAttachment(ctx.workspace.id, p.id, fd, "file", str(fd, "kind"));
    if (!att) throw new PayableError("attachmentMissing");
    await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "payable.attach", entity: "Payable", entityId: p.id, metadata: { kind: att.kind } });
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

// Série recorrente sem fim: gera as próximas 12 ocorrências a partir da última, com o mesmo dia âncora.
export async function extendSeriesAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePayables();
  const workspaceId = ctx.workspace.id;
  const seriesId = str(fd, "seriesId");
  const items = await db.payable.findMany({ where: { workspaceId, seriesId }, orderBy: { seriesIndex: "asc" } });
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last || !first.frequency || first.installmentTotal || !oneOf(FREQUENCIES, first.frequency)) return fail(new PayableError("notFound"));
  const frequency = first.frequency as Frequency;
  const firstDue = dateKeySP(first.dueDate);
  const firstComp = dateKeySP(first.competenceDate).slice(0, 7);
  const start = (last.seriesIndex ?? items.length) as number;
  const next = Array.from({ length: frequency === "weekly" ? 52 : frequency === "biweekly" ? 26 : 12 }, (_, k) => start + k);
  const template = last;
  await db.$transaction(
    next.map((i) => {
      const due = occurrenceDate(firstDue, frequency, i);
      const monthsAhead = (Number(due.slice(0, 4)) - Number(firstDue.slice(0, 4))) * 12 + (Number(due.slice(5, 7)) - Number(firstDue.slice(5, 7)));
      return db.payable.create({
        data: {
          workspaceId,
          description: template.description,
          supplierId: template.supplierId,
          categoryId: template.categoryId,
          amountCents: template.amountCents,
          method: template.method,
          costCenter: template.costCenter,
          notes: template.notes,
          deductible: template.deductible,
          dueDate: parseDateOnly(due),
          competenceDate: parseDateOnly(`${addMonthsKey(`${firstComp}-01`, monthsAhead).slice(0, 7)}-01`),
          seriesId,
          seriesIndex: i + 1,
          frequency,
          createdById: ctx.user.id,
        },
      });
    }),
  );
  await recordAudit({ workspaceId, userId: ctx.user.id, action: "payable.extend", entity: "Payable", entityId: last.id, metadata: { added: next.length } });
  revalidatePath(PATH);
  const t = await getTranslations("payables.detail");
  return { ok: t("seriesExtended", { count: next.length }) };
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
