import { beforeEach, describe, expect, it, vi } from "vitest";

// Baixa, ajuste e estorno contra um banco em memória com a mesma semântica das chamadas do Prisma que o estoque usa
// (updateMany condicional, incremento/decremento). Garante as regras de concorrência e de registro único da sessão.
type Row = Record<string, unknown>;
type Lot = { id: string; workspaceId: string; productId: string; lotNumber: string; expiresAt: Date; openedAt: Date | null; quantity: number };
type Move = { id: string; workspaceId: string; productId: string; lotId: string | null; kind: string; quantity: number; appointmentId: string | null; patientId: string | null; reason?: string | null };

const state = {
  products: [] as { id: string; workspaceId: string; openShelfLifeHours: number | null; unitCost: number | null }[],
  lots: [] as Lot[],
  moves: [] as Move[],
  appts: [] as { id: string; workspaceId: string; procedureRecordedAt: Date | null }[],
};

const match = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]) => {
    const cur = row[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const c = v as { gte?: number; not?: unknown; in?: unknown[] };
      if ("gte" in c) return (cur as number) >= (c.gte as number);
      if ("in" in c) return (c.in as unknown[]).includes(cur);
      if ("not" in c) return cur !== c.not;
    }
    return cur === v;
  });
const round = (n: number) => Math.round(n * 1000) / 1000;
const apply = (row: Row, data: Row) => {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const op = v as { decrement?: number; increment?: number };
      if (op.decrement !== undefined) row[k] = round((row[k] as number) - op.decrement);
      if (op.increment !== undefined) row[k] = round((row[k] as number) + op.increment);
    } else row[k] = v;
  }
};

let seq = 0;
const db = {
  product: { findFirst: async ({ where }: { where: Row }) => state.products.find((p) => match(p, where)) ?? null },
  stockLot: {
    findMany: async ({ where }: { where: Row }) => state.lots.filter((l) => match(l, where)).map((l) => ({ ...l })),
    findFirst: async ({ where, include }: { where: Row; include?: { product?: boolean } }) => {
      const l = state.lots.find((x) => match(x, where));
      return l ? { ...l, ...(include?.product ? { product: state.products.find((p) => p.id === l.productId) } : {}) } : null;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = state.lots.filter((l) => match(l, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const r = state.lots.find((l) => l.id === where.id) as Lot;
      apply(r, data);
      return r;
    },
  },
  stockMovement: {
    create: async ({ data }: { data: Row }) => {
      const m = { id: `m${++seq}`, appointmentId: null, patientId: null, ...data } as Move;
      state.moves.push(m);
      return m;
    },
    findMany: async ({ where }: { where: Row }) => state.moves.filter((m) => match(m, where)),
  },
  appointment: {
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = state.appts.filter((a) => match(a, where));
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
  },
  // Sem isolamento: a corrida é simulada mudando o saldo entre a leitura e a escrita.
  $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
};
vi.mock("@/lib/db", () => ({ db }));
const { adjustLot, recordUse, reverseUse } = await import("@/lib/stock");

const NOW = new Date("2026-10-07T12:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const W = "w1";
const lotQty = (id: string) => (state.lots.find((l) => l.id === id) as Lot).quantity;

beforeEach(() => {
  state.products = [
    { id: "tox", workspaceId: W, openShelfLifeHours: 72, unitCost: 10 },
    { id: "ah", workspaceId: W, openShelfLifeHours: null, unitCost: 500 },
  ];
  state.lots = [
    { id: "L-late", workspaceId: W, productId: "tox", lotNumber: "B", expiresAt: inDays(200), openedAt: null, quantity: 100 },
    { id: "L-soon", workspaceId: W, productId: "tox", lotNumber: "A", expiresAt: inDays(40), openedAt: null, quantity: 30 },
    { id: "L-old", workspaceId: W, productId: "tox", lotNumber: "X", expiresAt: inDays(-1), openedAt: null, quantity: 50 },
    { id: "AH1", workspaceId: W, productId: "ah", lotNumber: "H", expiresAt: inDays(100), openedAt: null, quantity: 2 },
    { id: "OTHER", workspaceId: "w2", productId: "tox", lotNumber: "Z", expiresAt: inDays(100), openedAt: null, quantity: 999 },
  ];
  state.moves = [];
  state.appts = [{ id: "s1", workspaceId: W, procedureRecordedAt: null }];
});

describe("recordUse", () => {
  it("baixa por FEFO dividindo entre lotes, ignora o vencido e marca a abertura", async () => {
    const used = await recordUse({ workspaceId: W, userId: "u", appointmentId: "s1", patientId: "p", items: [{ productId: "tox", quantity: 50 }], now: NOW });
    expect(used).toEqual([
      { productId: "tox", lotId: "L-soon", quantity: 30 },
      { productId: "tox", lotId: "L-late", quantity: 20 },
    ]);
    expect(lotQty("L-soon")).toBe(0);
    expect(lotQty("L-late")).toBe(80);
    expect(lotQty("L-old")).toBe(50);
    expect(state.lots.find((l) => l.id === "L-late")?.openedAt).toEqual(NOW);
    expect(state.moves.every((m) => m.kind === "uso" && m.patientId === "p" && m.appointmentId === "s1")).toBe(true);
  });

  it("não registra a mesma sessão duas vezes (clique duplo)", async () => {
    await recordUse({ workspaceId: W, userId: "u", appointmentId: "s1", items: [{ productId: "tox", quantity: 10 }], now: NOW });
    await expect(
      recordUse({ workspaceId: W, userId: "u", appointmentId: "s1", items: [{ productId: "tox", quantity: 10 }], now: NOW }),
    ).rejects.toMatchObject({ key: "alreadyRecorded" });
    expect(lotQty("L-soon")).toBe(20);
  });

  it("recusa saldo insuficiente, lote vencido e lote de outro consultório", async () => {
    await expect(recordUse({ workspaceId: W, userId: "u", items: [{ productId: "ah", quantity: 3 }], now: NOW })).rejects.toMatchObject({ key: "insufficient" });
    await expect(
      recordUse({ workspaceId: W, userId: "u", items: [{ productId: "tox", lotId: "L-old", quantity: 1 }], now: NOW }),
    ).rejects.toMatchObject({ key: "expired" });
    await expect(
      recordUse({ workspaceId: W, userId: "u", items: [{ productId: "tox", lotId: "OTHER", quantity: 1 }], now: NOW }),
    ).rejects.toMatchObject({ key: "lot" });
  });

  it("baixa atômica: se o saldo acabou entre a leitura e a escrita, falha em vez de ficar negativo", async () => {
    const orig = db.stockLot.findMany;
    db.stockLot.findMany = async (args) => {
      const rows = await orig(args);
      // Outra baixa leva as duas seringas depois da leitura.
      (state.lots.find((l) => l.id === "AH1") as Lot).quantity = 0;
      return rows;
    };
    try {
      await expect(recordUse({ workspaceId: W, userId: "u", items: [{ productId: "ah", quantity: 2 }], now: NOW })).rejects.toMatchObject({
        key: "insufficient",
      });
      expect(lotQty("AH1")).toBe(0);
    } finally {
      db.stockLot.findMany = orig;
    }
  });
});

describe("adjustLot", () => {
  it("perda e ajuste mexem no saldo; venda de vencido é recusada; saldo não fica negativo", async () => {
    await adjustLot({ workspaceId: W, userId: "u", lotId: "L-late", kind: "perda", quantity: 5, now: NOW });
    expect(lotQty("L-late")).toBe(95);
    await adjustLot({ workspaceId: W, userId: "u", lotId: "L-late", kind: "ajuste", quantity: 2.5, now: NOW });
    expect(lotQty("L-late")).toBe(97.5);
    await expect(adjustLot({ workspaceId: W, userId: "u", lotId: "L-old", kind: "venda", quantity: 1, now: NOW })).rejects.toMatchObject({ key: "expired" });
    await adjustLot({ workspaceId: W, userId: "u", lotId: "L-old", kind: "perda", quantity: 50, now: NOW });
    expect(lotQty("L-old")).toBe(0);
    await expect(adjustLot({ workspaceId: W, userId: "u", lotId: "L-old", kind: "perda", quantity: 1, now: NOW })).rejects.toMatchObject({
      key: "insufficient",
    });
  });
});

describe("reverseUse", () => {
  it("devolve o líquido a cada lote, libera a sessão e não estorna duas vezes", async () => {
    await recordUse({ workspaceId: W, userId: "u", appointmentId: "s1", items: [{ productId: "tox", quantity: 50 }], now: NOW });
    await expect(reverseUse({ workspaceId: W, userId: "u", appointmentId: "s1", reason: " " })).rejects.toMatchObject({ key: "reversalReason" });
    const back = await reverseUse({ workspaceId: W, userId: "u", appointmentId: "s1", reason: "lançado errado" });
    expect(back).toHaveLength(2);
    expect(lotQty("L-soon")).toBe(30);
    expect(lotQty("L-late")).toBe(100);
    await expect(reverseUse({ workspaceId: W, userId: "u", appointmentId: "s1", reason: "de novo" })).rejects.toMatchObject({ key: "notRecorded" });
    // Novo registro e novo estorno: só o que saiu da segunda vez volta.
    await recordUse({ workspaceId: W, userId: "u", appointmentId: "s1", items: [{ productId: "tox", quantity: 10 }], now: NOW });
    await reverseUse({ workspaceId: W, userId: "u", appointmentId: "s1", reason: "outra vez" });
    expect(lotQty("L-soon")).toBe(30);
    expect(lotQty("L-late")).toBe(100);
    expect(state.moves.filter((m) => m.kind === "estorno").every((m) => m.reason)).toBe(true);
  });
});
