"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { ensureAffected } from "@/lib/tenant";
import { parseDateOnly, parseDateTimeLocal } from "@/lib/dates";
import { adjustLot, openLot, parseDecimal, receiveLot, roundQty, StockError } from "@/lib/stock";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { LOSS_REASONS, PRODUCT_KINDS, UNITS, requireStock } from "./_lib";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optional = (fd: FormData, key: string) => str(fd, key) || null;

// Mensagem de erro no idioma da pessoa: StockError traz a chave de stock.errors.
async function fail(e: unknown): Promise<FormResult> {
  const t = await getTranslations("stock.errors");
  if (e instanceof StockError) return { erro: t.has(e.key) ? t(e.key) : t("generic") };
  throw e;
}

export async function saveProductAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireStock("manage");
  const t = await getTranslations("stock.errors");
  const id = optional(fd, "id");
  const name = str(fd, "name");
  const kind = str(fd, "kind");
  const unit = str(fd, "unit");
  if (name.length < 2) return { erro: t("nameRequired") };
  if (!(PRODUCT_KINDS as readonly string[]).includes(kind)) return { erro: t("kindInvalid") };
  if (!(UNITS as readonly string[]).includes(unit)) return { erro: t("unitInvalid") };

  const unitCostRaw = str(fd, "unitCost");
  const unitCost = unitCostRaw ? parseDecimal(unitCostRaw) : null;
  if (unitCost !== null && !(unitCost >= 0)) return { erro: t("costInvalid") };
  const minRaw = str(fd, "minStock");
  const minStock = minRaw ? parseDecimal(minRaw) : 0;
  if (!(minStock >= 0)) return { erro: t("minStockInvalid") };
  const hoursRaw = str(fd, "openShelfLifeHours");
  const hours = hoursRaw ? parseDecimal(hoursRaw) : null;
  if (hours !== null && !(Number.isInteger(hours) && hours > 0)) return { erro: t("hoursInvalid") };

  const data = {
    name,
    brand: optional(fd, "brand"),
    kind,
    unit,
    anvisaRegistry: optional(fd, "anvisaRegistry"),
    supplier: optional(fd, "supplier"),
    unitCost,
    minStock: roundQty(minStock),
    openShelfLifeHours: hours,
    active: id ? fd.get("active") === "on" : true,
  };

  let productId: string;
  if (id) {
    ensureAffected(await db.product.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data }));
    productId = id;
  } else {
    productId = (await db.product.create({ data: { ...data, workspaceId: ctx.workspace.id } })).id;
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: id ? "product.update" : "product.create",
    entity: "Product",
    entityId: productId,
  });
  redirect(`/app/estoque/${productId}`);
}

export async function receiveLotAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireStock("manage");
  const t = await getTranslations("stock.errors");
  const productId = str(fd, "productId");
  const lotNumber = str(fd, "lotNumber");
  const expires = str(fd, "expiresAt");
  if (!lotNumber) return { erro: t("lotNumberRequired") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { erro: t("expiresRequired") };
  const quantity = parseDecimal(fd.get("quantity"));
  const costRaw = str(fd, "unitCost");
  const unitCost = costRaw ? parseDecimal(costRaw) : null;
  if (unitCost !== null && !(unitCost >= 0)) return { erro: t("costInvalid") };

  let lotId: string;
  try {
    const lot = await receiveLot({
      workspaceId: ctx.workspace.id,
      productId,
      userId: ctx.user.id,
      lotNumber,
      expiresAt: parseDateOnly(expires),
      quantity: roundQty(quantity),
      unitCost,
      supplier: optional(fd, "supplier"),
      notes: optional(fd, "notes"),
    });
    lotId = lot.id;
  } catch (e) {
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "stock_lot.receive",
    entity: "StockLot",
    entityId: lotId,
    metadata: { productId, quantity },
  });
  redirect(`/app/estoque/${productId}`);
}

// Ajuste de inventário: a pessoa informa o saldo contado e o sistema grava a diferença.
export async function countLotAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireStock("manage");
  const t = await getTranslations("stock.errors");
  const counted = parseDecimal(fd.get("counted"));
  if (!(counted >= 0)) return { erro: t("quantity") };
  const lot = await db.stockLot.findFirst({ where: { id: str(fd, "lotId"), workspaceId: ctx.workspace.id } });
  if (!lot) return { erro: t("lot") };
  const delta = roundQty(counted - lot.quantity);
  if (delta === 0) return { erro: t("noDifference") };
  try {
    await adjustLot({ workspaceId: ctx.workspace.id, userId: ctx.user.id, lotId: lot.id, kind: "ajuste", quantity: delta, reason: optional(fd, "reason") });
  } catch (e) {
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "stock_lot.ajuste",
    entity: "StockLot",
    entityId: lot.id,
    metadata: { from: lot.quantity, to: counted },
  });
  revalidatePath(`/app/estoque/${lot.productId}`);
  return { ok: (await getTranslations("stock.detail"))("countSaved") };
}

// Saída que não é atendimento: perda (com motivo) ou venda de produto de revenda.
export async function lotOutAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireStock("manage");
  const t = await getTranslations("stock.errors");
  const kind = str(fd, "kind");
  if (kind !== "perda" && kind !== "venda") return { erro: t("generic") };
  const quantity = parseDecimal(fd.get("quantity"));
  if (!(quantity > 0)) return { erro: t("quantity") };
  const reason = kind === "perda" ? str(fd, "reason") : "";
  if (kind === "perda" && !(LOSS_REASONS as readonly string[]).includes(reason)) return { erro: t("reasonRequired") };
  const lot = await db.stockLot.findFirst({
    where: { id: str(fd, "lotId"), workspaceId: ctx.workspace.id },
    include: { product: { select: { kind: true } } },
  });
  if (!lot) return { erro: t("lot") };
  if (kind === "venda" && lot.product.kind !== "revenda") return { erro: t("saleOnlyResale") };
  try {
    await adjustLot({ workspaceId: ctx.workspace.id, userId: ctx.user.id, lotId: lot.id, kind, quantity: roundQty(quantity), reason: reason || null });
  } catch (e) {
    return fail(e);
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: `stock_lot.${kind}`,
    entity: "StockLot",
    entityId: lot.id,
    metadata: { quantity, reason: reason || undefined },
  });
  revalidatePath(`/app/estoque/${lot.productId}`);
  return { ok: (await getTranslations("stock.detail"))(kind === "perda" ? "lossSaved" : "saleSaved") };
}

// Abertura/reconstituição do frasco: começa a contar a validade depois de aberto.
export async function openLotAction(fd: FormData) {
  const ctx = await requireStock("manage");
  const lotId = str(fd, "lotId");
  try {
    const lot = await openLot({ workspaceId: ctx.workspace.id, lotId });
    await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "stock_lot.open", entity: "StockLot", entityId: lot.id });
    revalidatePath(`/app/estoque/${lot.productId}`);
  } catch (e) {
    if (!(e instanceof StockError)) throw e;
  }
}

// Correção da abertura do frasco (marcada na hora errada ou sem querer): nova data/hora ou "não aberto".
// Fica na auditoria com o valor anterior, porque muda a validade depois de aberto.
export async function correctOpenedAtAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireStock("manage");
  const t = await getTranslations("stock.errors");
  const lot = await db.stockLot.findFirst({ where: { id: str(fd, "lotId"), workspaceId: ctx.workspace.id } });
  if (!lot) return { erro: t("lot") };
  const raw = str(fd, "openedAt");
  const clear = fd.get("notOpened") === "on";
  let openedAt: Date | null = null;
  if (!clear) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return { erro: t("openedAtInvalid") };
    openedAt = parseDateTimeLocal(raw);
    if (openedAt.getTime() > Date.now() || openedAt < lot.receivedAt) return { erro: t("openedAtRange") };
  }
  await db.stockLot.update({ where: { id: lot.id }, data: { openedAt } });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "stock_lot.correct_opened",
    entity: "StockLot",
    entityId: lot.id,
    metadata: { from: lot.openedAt?.toISOString() ?? null, to: openedAt?.toISOString() ?? null },
  });
  revalidatePath(`/app/estoque/lote/${lot.id}`);
  revalidatePath(`/app/estoque/${lot.productId}`);
  return { ok: (await getTranslations("stock.lot"))("openedCorrected") };
}
