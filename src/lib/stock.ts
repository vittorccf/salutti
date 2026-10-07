// Estoque da Salutti Estética: lotes com validade, saída por FEFO (vence primeiro, sai primeiro), validade
// depois de aberto (toxina reconstituída) e rastreabilidade de qual lote foi aplicado em qual paciente.
// Todas as funções recebem o workspaceId e filtram por ele (multi-tenant).
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { dateKeySP } from "./dates";
import { TranslatableError } from "@/i18n/errors";

// Erros com a chave da mensagem (stock.errors.*); a action traduz com errorMessage().
export class StockError extends TranslatableError {}

export const EXPIRING_DAYS = 30;
const DAY = 86_400_000;

type LotLike = { expiresAt: Date; openedAt: Date | null; quantity: number };
type ProductLike = { openShelfLifeHours: number | null };

// Situação do lote agora: vencido pela validade do fabricante, vencido depois de aberto, vencendo em 30 dias, ok.
// "Válido até 31/10" vale o dia 31 inteiro: compara o dia (calendário de São Paulo), não o instante.
export function lotStatus(lot: LotLike, product: ProductLike, now = new Date()) {
  if (dateKeySP(lot.expiresAt) < dateKeySP(now)) return "vencido" as const;
  if (lot.openedAt && product.openShelfLifeHours) {
    const openLimit = lot.openedAt.getTime() + product.openShelfLifeHours * 3_600_000;
    if (openLimit <= now.getTime()) return "aberto_vencido" as const;
  }
  if (lot.expiresAt.getTime() - now.getTime() <= EXPIRING_DAYS * DAY) return "vencendo" as const;
  return "ok" as const;
}
export type LotStatus = ReturnType<typeof lotStatus>;

// Lote que ainda pode ser aplicado ou vendido (não vencido, nem vencido depois de aberto).
export const isUsable = (status: LotStatus) => status === "ok" || status === "vencendo";

// Arredonda a 3 casas: frações de mL/U não podem deixar resíduo de ponto flutuante no saldo.
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;

// Quantidade digitada no formulário: aceita vírgula decimal ("0,5") e milhar com ponto ("1.000,5").
// Devolve NaN se não for número.
export function parseDecimal(value: unknown): number {
  let s = String(value ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

// Baixa atômica: só desconta se ainda houver saldo no momento da escrita (duas baixas simultâneas no mesmo
// lote não se sobrescrevem; a segunda falha se o saldo acabou).
async function decrementLot(tx: Prisma.TransactionClient, lotId: string, take: number, data: Prisma.StockLotUpdateManyMutationInput = {}) {
  const { count } = await tx.stockLot.updateMany({
    where: { id: lotId, quantity: { gte: take - 1e-9 } },
    data: { ...data, quantity: { decrement: take } },
  });
  if (count !== 1) throw new StockError("insufficient");
}

// Saldo utilizável do produto (lotes não vencidos) e próxima validade entre eles.
export function productSummary<L extends LotLike>(lots: L[], product: ProductLike & { minStock: number }, now = new Date()) {
  let total = 0;
  let nextExpiry: Date | null = null;
  const statuses = new Set<LotStatus>();
  for (const l of lots) {
    if (!(l.quantity > 0)) continue;
    const st = lotStatus(l, product, now);
    statuses.add(st);
    if (!isUsable(st)) continue;
    total += l.quantity;
    if (!nextExpiry || l.expiresAt < nextExpiry) nextExpiry = l.expiresAt;
  }
  total = roundQty(total);
  const low = product.minStock > 0 && total < product.minStock;
  // Situação mais grave primeiro: vencido (inclusive depois de aberto) > vencendo > abaixo do mínimo > ok.
  const status =
    statuses.has("vencido") || statuses.has("aberto_vencido")
      ? ("vencido" as const)
      : statuses.has("vencendo")
        ? ("vencendo" as const)
        : low
          ? ("baixo" as const)
          : ("ok" as const);
  const expiring = statuses.has("vencendo");
  const expired = statuses.has("vencido") || statuses.has("aberto_vencido");
  return { total, nextExpiry, low, expiring, expired, status };
}
export type ProductStatus = ReturnType<typeof productSummary>["status"];

// Fim da validade depois de aberto (null se o frasco não foi aberto ou o produto não tem esse prazo).
export const openExpiresAt = (lot: LotLike, product: ProductLike) =>
  lot.openedAt && product.openShelfLifeHours ? new Date(lot.openedAt.getTime() + product.openShelfLifeHours * 3_600_000) : null;

// Ordem de uso: frasco já aberto primeiro (antes que vença depois de aberto), depois o que vence antes.
export function fefoOrder<T extends LotLike>(lots: T[], product: ProductLike, now = new Date()): T[] {
  return lots
    .filter((l) => l.quantity > 0 && isUsable(lotStatus(l, product, now)))
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
  /** campos da sessão gravados junto com a marca de registro (ficha técnica) */
  appointmentData?: { procedureDetails?: string | null; procedureAdverseEvent?: string | null };
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    // Marca a sessão como registrada na mesma transação: clique duplo ou duas abas não baixam duas vezes.
    if (input.appointmentId) {
      const { count } = await tx.appointment.updateMany({
        where: { id: input.appointmentId, workspaceId: input.workspaceId, procedureRecordedAt: null },
        data: { procedureRecordedAt: now, ...input.appointmentData },
      });
      if (count !== 1) throw new StockError("alreadyRecorded");
    }
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
        const take = roundQty(Math.min(lot.quantity, remaining));
        await decrementLot(tx, lot.id, take, product.openShelfLifeHours && !lot.openedAt ? { openedAt: now } : {});
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
        remaining = roundQty(remaining - take);
      }
      if (remaining > 0) throw new StockError("insufficient");
    }
    return used;
  });
}

// Ajuste de inventário, perda (vencido, sobra de frasco, quebra) ou venda de revenda, num lote específico.
// Venda de lote vencido (inclusive depois de aberto) é recusada; perda de vencido é justamente o descarte.
export async function adjustLot(input: {
  workspaceId: string;
  userId: string;
  lotId: string;
  kind: "ajuste" | "perda" | "venda";
  quantity: number; // ajuste: pode ser negativo ou positivo; perda/venda: quantidade que sai (positiva)
  reason?: string | null;
  patientId?: string | null;
  now?: Date;
}) {
  const delta = roundQty(input.kind === "ajuste" ? input.quantity : -Math.abs(input.quantity));
  if (delta === 0 || !Number.isFinite(delta)) throw new StockError("quantity");
  return db.$transaction(async (tx) => {
    const lot = await tx.stockLot.findFirst({ where: { id: input.lotId, workspaceId: input.workspaceId }, include: { product: true } });
    if (!lot) throw new StockError("lot");
    if (input.kind === "venda" && !isUsable(lotStatus(lot, lot.product, input.now ?? new Date()))) throw new StockError("expired");
    if (delta < 0) await decrementLot(tx, lot.id, -delta);
    else await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: { increment: delta } } });
    return tx.stockMovement.create({
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
    });
  });
}

// Estorno do registro de uma sessão (lançamento errado): devolve a cada lote o saldo líquido que saiu na sessão
// (usos menos estornos anteriores), grava movimentos "estorno" com o motivo e libera a sessão para novo registro.
// O histórico não é apagado: o uso original e o estorno ficam na rastreabilidade.
export async function reverseUse(input: { workspaceId: string; userId: string; appointmentId: string; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) throw new StockError("reversalReason");
  return db.$transaction(async (tx) => {
    const { count } = await tx.appointment.updateMany({
      where: { id: input.appointmentId, workspaceId: input.workspaceId, procedureRecordedAt: { not: null } },
      data: { procedureRecordedAt: null },
    });
    if (count !== 1) throw new StockError("notRecorded");
    const moves = await tx.stockMovement.findMany({
      where: { workspaceId: input.workspaceId, appointmentId: input.appointmentId, kind: { in: ["uso", "estorno"] } },
    });
    const net = new Map<string, { productId: string; patientId: string | null; quantity: number }>();
    for (const m of moves) {
      if (!m.lotId) continue;
      const cur = net.get(m.lotId) ?? { productId: m.productId, patientId: m.patientId, quantity: 0 };
      cur.quantity = roundQty(cur.quantity + m.quantity);
      net.set(m.lotId, cur);
    }
    const reversed: { lotId: string; quantity: number }[] = [];
    for (const [lotId, n] of net) {
      const back = roundQty(-n.quantity);
      if (back <= 0) continue;
      await tx.stockLot.update({ where: { id: lotId }, data: { quantity: { increment: back } } });
      await tx.stockMovement.create({
        data: {
          workspaceId: input.workspaceId,
          productId: n.productId,
          lotId,
          kind: "estorno",
          quantity: back,
          reason,
          appointmentId: input.appointmentId,
          patientId: n.patientId,
          userId: input.userId,
        },
      });
      reversed.push({ lotId, quantity: back });
    }
    return reversed;
  });
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
    // Lote vencido não conta para o estoque mínimo: não pode ser usado.
    const { total, low: isLow } = productSummary(p.lots, p, now);
    if (isLow) low.push({ productId: p.id, name: p.name, unit: p.unit, total, minStock: p.minStock });
    for (const l of p.lots) {
      const status = lotStatus(l, p, now);
      if (status !== "ok") lots.push({ productId: p.id, name: p.name, unit: p.unit, lotId: l.id, lotNumber: l.lotNumber, quantity: l.quantity, status, expiresAt: l.expiresAt });
    }
  }
  return { low, lots };
}

// Registra a abertura/reconstituição do frasco agora (começa a contar a validade depois de aberto).
export async function openLot(input: { workspaceId: string; lotId: string; now?: Date }) {
  const lot = await db.stockLot.findFirst({ where: { id: input.lotId, workspaceId: input.workspaceId } });
  if (!lot) throw new StockError("lot");
  if (lot.openedAt) return lot;
  return db.stockLot.update({ where: { id: lot.id }, data: { openedAt: input.now ?? new Date() } });
}
