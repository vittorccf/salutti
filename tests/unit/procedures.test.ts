import { describe, expect, it } from "vitest";
import { groupPhotos, parseQuantity, returnDate, returnStartsAtLocal, sessionMargin, suppliesCost } from "@/lib/procedures";
import { toDateTimeLocalSP } from "@/lib/dates";

describe("parseQuantity", () => {
  it("aceita vírgula e ponto decimais", () => {
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("1.5")).toBe(1.5);
    expect(parseQuantity(" 50 ")).toBe(50);
    expect(parseQuantity("1.000,25")).toBe(1000.25);
    expect(parseQuantity("0,1234")).toBe(0.123);
  });
  it("vazio vira null; inválido vira NaN", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity("-1")).toBeNaN();
    expect(parseQuantity("abc")).toBeNaN();
  });
});

describe("custo e margem", () => {
  it("usa o custo do lote e, sem ele, o do produto", () => {
    const cost = suppliesCost([
      { quantity: -50, lotUnitCost: 10, productUnitCost: 8 },
      { quantity: -1, lotUnitCost: null, productUnitCost: 30.5 },
      { quantity: -2, lotUnitCost: null, productUnitCost: null },
    ]);
    expect(cost).toBe(530.5);
  });
  it("margem é valor menos custo", () => {
    expect(sessionMargin(1200, 530.5)).toEqual({ value: 669.5, percent: (669.5 / 1200) * 100 });
    expect(sessionMargin(0, 10).percent).toBeNull();
  });
});

describe("retorno sugerido", () => {
  it("mantém o horário de São Paulo, dias depois", () => {
    const start = new Date("2026-10-06T17:00:00Z"); // 14:00 em São Paulo
    expect(toDateTimeLocalSP(returnDate(start, 120))).toBe("2027-02-03T14:00");
    expect(returnStartsAtLocal(start, 15)).toBe("2026-10-21T14:00");
  });
});

describe("groupPhotos", () => {
  it("agrupa por procedimento e etapa, grupos pela foto mais recente", () => {
    const d = (s: string) => new Date(s);
    const groups = groupPhotos([
      { id: "1", procedureId: "a", stage: "antes", takenAt: d("2026-01-01") },
      { id: "2", procedureId: "a", stage: "depois", takenAt: d("2026-02-01") },
      { id: "3", procedureId: null, stage: "durante", takenAt: d("2026-03-01") },
      { id: "4", procedureId: "a", stage: "outra", takenAt: d("2025-12-01") },
    ]);
    expect(groups.map((g) => g.procedureId)).toEqual([null, "a"]);
    expect(groups[1].stages.antes.map((p) => p.id)).toEqual(["4", "1"]);
    expect(groups[1].stages.depois.map((p) => p.id)).toEqual(["2"]);
    expect(groups[0].stages.durante.map((p) => p.id)).toEqual(["3"]);
  });
});
