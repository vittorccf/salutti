// Estoque da Salutti Estética: lotes com validade, saída por FEFO (vence primeiro, sai primeiro), validade
// depois de aberto (toxina reconstituída) e rastreabilidade de qual lote foi aplicado em qual paciente.
// Todas as funções recebem o workspaceId e filtram por ele (multi-tenant).
import { db } from "./db";
import { TranslatableError } from "@/i18n/errors";

// Erros com a chave da mensagem (stock.errors.*); a action traduz com errorMessage().
export class StockError extends TranslatableError {}

export const EXPIRING_DAYS = 30;
const DAY = 86_400_000;

type LotLike = { expiresAt: Date; openedAt: Date | null; quantity: number };
type ProductLike = { openShelfLifeHours: number | null };

// Situação do lote agora: vencido pela validade do fabricante, vencido depois de aberto, vencendo em 30 dias, ok.
export function lotStatus(lot: LotLike, product: ProductLike, now = new Date()) {
  if (lot.expiresAt.getTime() <= now.getTime()) return "vencido" as const;
  if (lot.openedAt && product.openShelfLifeHours) {
    const openLimit = lot.openedAt.getTime() + product.openShelfLifeHours * 3_600_000;
    if (openLimit <= now.getTime()) return "aberto_vencido" as const;
  }
  if (lot.expiresAt.getTime() - now.getTime() <= EXPIRING_DAYS * DAY) return "vencendo" as const;
  return "ok" as const;
}
export type LotStatus = ReturnType<typeof lotStatus>;

// Fim da validade depois de aberto (null se o frasco não foi aberto ou o produto não tem esse prazo).
export const openExpiresAt = (lot: LotLike, product: ProductLike) =>
  lot.openedAt && product.openShelfLifeHours ? new Date(lot.openedAt.getTime() + product.openShelfLifeHours * 3_600_000) : null;

// Ordem de uso: frasco já aberto primeiro (antes que vença depois de aberto), depois o que vence antes.
export function fefoOrder<T extends LotLike>(lots: T[], product: ProductLike, now = new Date()): T[] {
  return lots
    .filter((l) => l.quantity > 0 && (lotStatus(l, product, now) === "ok" || lotStatus(l, product, now) === "vencendo"))
    .sort((a, b) => Number(Boolean(b.openedAt)) - Number(Boolean(a.openedAt)) || a.expiresAt.getTime() - b.expiresAt.getTime());
}

export async function receiveLot(input: {
  workspaceId: string;
  productId: string;
  userId: string;
  lotNumber: string;
  expiresAt: Date;
  quantity: number;
  unitCost?: number | null;
  supplier?: string | null;
  notes?: string | null;
}) {
  if (!(input.quantity > 0)) throw new StockError("quantity");
  const product = await db.product.findFirst({ where: { id: input.productId, workspaceId: input.workspaceId } });
  if (!product) throw new StockError("product");
  return db.$transaction(async (tx) => {
    const lot = await tx.stockLot.create({
      data: {
        workspaceId: input.workspaceId,
        productId: product.id,
        lotNumber: input.lotNumber.trim(),
        expiresAt: input.expiresAt,
        initialQuantity: input.quantity,
        quantity: input.quantity,
        unitCost: input.unitCost ?? product.unitCost ?? null,
        supplier: input.supplier ?? product.supplier ?? null,
        notes: input.notes ?? null,
      },
    });
    await tx.stockMovement.create({
      data: { workspaceId: input.workspaceId, productId: product.id, lotId: lot.id, kind: "entrada", quantity: input.quantity, userId: input.userId },
    });
    return lot;
  });
}

// Uso em atendimento: baixa cada item no lote informado ou, sem lote, pelos lotes em ordem FEFO (pode dividir
// entre lotes). Recusa lote vencido (inclusive depois de aberto) e quantidade maior que o saldo.
export async function recordUse(input: {
  workspaceId: string;
  userId: string;
  appointmentId?: string | null;
  patientId?: string | null;
  items: { productId: string; lotId?: string | null; quantity: number }[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const used: { productId: string; lotId: string; quantity: number }[] = [];
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new StockError("quantity");
      const product = await tx.product.findFirst({ where: { id: item.productId, workspaceId: input.workspaceId } });
      if (!product) throw new StockError("product");
      const lots = await tx.stockLot.findMany({
        where: { productId: product.id, workspaceId: input.workspaceId, ...(item.lotId ? { id: item.lotId } : {}) },
      });
      if (item.lotId && lots.length === 0) throw new StockError("lot");
      if (item.lotId && lots[0] && ["vencido", "aberto_vencido"].includes(lotStatus(lots[0], product, now))) {
        throw new StockError("expired");
      }
      const ordered = fefoOrder(lots, product, now);
      let remaining = item.quantity;
      for (const lot of ordered) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantity, remaining);
        // Arredonda a 3 casas: frações de mL/U não podem deixar resíduo de ponto flutuante no saldo.
        const left = Math.round((lot.quantity - take) * 1000) / 1000;
        await tx.stockLot.update({
          where: { id: lot.id },
          data: { quantity: left, ...(product.openShelfLifeHours && !lot.openedAt ? { openedAt: now } : {}) },
        });
        await tx.stockMovement.create({
          data: {
            workspaceId: input.workspaceId,
            productId: product.id,
            lotId: lot.id,
            kind: "uso",
            quantity: -take,
            appointmentId: input.appointmentId ?? null,
            patientId: input.patientId ?? null,
            userId: input.userId,
          },
        });
        used.push({ productId: product.id, lotId: lot.id, quantity: take });
        remaining = Math.round((remaining - take) * 1000) / 1000;
      }
      if (remaining > 0) throw new StockError("insufficient");
    }
    return used;
  });
}

// Ajuste de inventário, perda (vencido, sobra de frasco, quebra) ou venda de revenda, num lote específico.
export async function adjustLot(input: {
  workspaceId: string;
  userId: string;
  lotId: string;
  kind: "ajuste" | "perda" | "venda";
  quantity: number; // ajuste: pode ser negativo ou positivo; perda/venda: quantidade que sai (positiva)
  reason?: string | null;
  patientId?: string | null;
}) {
  const lot = await db.stockLot.findFirst({ where: { id: input.lotId, workspaceId: input.workspaceId } });
  if (!lot) throw new StockError("lot");
  const delta = input.kind === "ajuste" ? input.quantity : -Math.abs(input.quantity);
  if (delta === 0) throw new StockError("quantity");
  const left = Math.round((lot.quantity + delta) * 1000) / 1000;
  if (left < 0) throw new StockError("insufficient");
  return db.$transaction([
    db.stockLot.update({ where: { id: lot.id }, data: { quantity: left } }),
    db.stockMovement.create({
      data: {
        workspaceId: input.workspaceId,
        productId: lot.productId,
        lotId: lot.id,
        kind: input.kind,
        quantity: delta,
        reason: input.reason ?? null,
        patientId: input.patientId ?? null,
        userId: input.userId,
      },
    }),
  ]);
}

// Alertas do painel e da tela de estoque: abaixo do mínimo, lote vencendo em 30 dias, vencido com saldo,
// frasco aberto vencido com saldo.
export async function stockAlerts(workspaceId: string, now = new Date()) {
  const products = await db.product.findMany({
    where: { workspaceId, active: true },
    include: { lots: { where: { quantity: { gt: 0 } } } },
    orderBy: { name: "asc" },
  });
  const low: { productId: string; name: string; unit: string; total: number; minStock: number }[] = [];
  const lots: { productId: string; name: string; unit: string; lotId: string; lotNumber: string; quantity: number; status: LotStatus; expiresAt: Date }[] = [];
  for (const p of products) {
    const total = Math.round(p.lots.reduce((s, l) => s + l.quantity, 0) * 1000) / 1000;
    if (p.minStock > 0 && total < p.minStock) low.push({ productId: p.id, name: p.name, unit: p.unit, total, minStock: p.minStock });
    for (const l of p.lots) {
      const status = lotStatus(l, p, now);
      if (status !== "ok") lots.push({ productId: p.id, name: p.name, unit: p.unit, lotId: l.id, lotNumber: l.lotNumber, quantity: l.quantity, status, expiresAt: l.expiresAt });
    }
  }
  return { low, lots };
}
