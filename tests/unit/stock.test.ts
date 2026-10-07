import { describe, expect, it, vi } from "vitest";

// Só as funções puras do estoque: o banco não é usado.
vi.mock("@/lib/db", () => ({ db: {} }));
import { fefoOrder, lotStatus, openExpiresAt, parseDecimal, productSummary } from "@/lib/stock";

const NOW = new Date("2026-10-07T12:00:00Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * HOUR);

const toxin = { openShelfLifeHours: 72 };
const filler = { openShelfLifeHours: null };
const lot = (id: string, expiresInDays: number, extra: { openedAt?: Date | null; quantity?: number } = {}) => ({
  id,
  expiresAt: days(expiresInDays),
  openedAt: extra.openedAt ?? null,
  quantity: extra.quantity ?? 10,
});

describe("lotStatus", () => {
  it("ok quando falta mais de 30 dias", () => {
    expect(lotStatus(lot("a", 90), filler, NOW)).toBe("ok");
  });

  it("vencendo dentro de 30 dias (inclusive o 30º)", () => {
    expect(lotStatus(lot("a", 30), filler, NOW)).toBe("vencendo");
    expect(lotStatus(lot("a", 1), filler, NOW)).toBe("vencendo");
  });

  it("vencido na data de validade ou depois", () => {
    expect(lotStatus(lot("a", 0), filler, NOW)).toBe("vencido");
    expect(lotStatus(lot("a", -5), filler, NOW)).toBe("vencido");
  });

  it("aberto vencido quando passou da validade depois de aberto", () => {
    expect(lotStatus(lot("a", 200, { openedAt: hoursAgo(73) }), toxin, NOW)).toBe("aberto_vencido");
    expect(lotStatus(lot("a", 200, { openedAt: hoursAgo(71) }), toxin, NOW)).toBe("ok");
  });

  it("validade do fabricante vence antes da validade depois de aberto", () => {
    expect(lotStatus(lot("a", -1, { openedAt: hoursAgo(1) }), toxin, NOW)).toBe("vencido");
  });

  it("produto sem prazo depois de aberto ignora a abertura", () => {
    expect(lotStatus(lot("a", 200, { openedAt: hoursAgo(10_000) }), filler, NOW)).toBe("ok");
  });
});

describe("openExpiresAt", () => {
  it("abertura + horas do produto", () => {
    const openedAt = new Date("2026-10-07T09:00:00Z");
    expect(openExpiresAt(lot("a", 100, { openedAt }), toxin)).toEqual(new Date("2026-10-10T09:00:00Z"));
    expect(openExpiresAt(lot("a", 100, { openedAt }), { openShelfLifeHours: 4 })).toEqual(new Date("2026-10-07T13:00:00Z"));
  });

  it("null se não foi aberto ou o produto não tem prazo", () => {
    expect(openExpiresAt(lot("a", 100), toxin)).toBeNull();
    expect(openExpiresAt(lot("a", 100, { openedAt: hoursAgo(1) }), filler)).toBeNull();
  });
});

describe("fefoOrder", () => {
  it("frasco aberto primeiro, depois o que vence antes", () => {
    const lots = [lot("tarde", 300), lot("cedo", 60), lot("aberto", 400, { openedAt: hoursAgo(2) })];
    expect(fefoOrder(lots, toxin, NOW).map((l) => l.id)).toEqual(["aberto", "cedo", "tarde"]);
  });

  it("ignora vencidos, abertos vencidos e lotes sem saldo", () => {
    const lots = [
      lot("vencido", -1),
      lot("abertoVencido", 300, { openedAt: hoursAgo(80) }),
      lot("zerado", 10, { quantity: 0 }),
      lot("vencendo", 10),
      lot("ok", 120),
    ];
    expect(fefoOrder(lots, toxin, NOW).map((l) => l.id)).toEqual(["vencendo", "ok"]);
  });

  it("não altera a lista original", () => {
    const lots = [lot("b", 90), lot("a", 40)];
    fefoOrder(lots, filler, NOW);
    expect(lots.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("productSummary", () => {
  it("saldo utilizável não conta lote vencido; status pega o mais grave", () => {
    const s = productSummary([lot("a", -1, { quantity: 4 }), lot("b", 20, { quantity: 2.5 }), lot("c", 90, { quantity: 0.1 })], { ...filler, minStock: 5 }, NOW);
    expect(s.total).toBe(2.6);
    expect(s.nextExpiry).toEqual(days(20));
    expect(s).toMatchObject({ low: true, expiring: true, expired: true, status: "vencido" });
  });

  it("abaixo do mínimo sem problema de validade", () => {
    expect(productSummary([lot("a", 90, { quantity: 1 })], { ...filler, minStock: 2 }, NOW).status).toBe("baixo");
    expect(productSummary([lot("a", 90, { quantity: 3 })], { ...filler, minStock: 2 }, NOW).status).toBe("ok");
  });
});

describe("parseDecimal", () => {
  it("aceita vírgula decimal e milhar com ponto", () => {
    expect(parseDecimal("0,5")).toBe(0.5);
    expect(parseDecimal("1.000,25")).toBe(1000.25);
    expect(parseDecimal("2.5")).toBe(2.5);
    expect(parseDecimal(" 12 ")).toBe(12);
    expect(parseDecimal("-1,5")).toBe(-1.5);
  });

  it("NaN para vazio ou texto", () => {
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal(null)).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("1,2,3")).toBeNaN();
  });
});
