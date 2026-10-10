import { describe, expect, it } from "vitest";
import { AREAS, areaOf, areaOfSegment, moduleEnabled, professionalDefaults } from "@/lib/areas";
import {
  DECIDUOUS_TEETH,
  isAnterior,
  isValidTooth,
  labOverdue,
  normalizeFaces,
  PERMANENT_TEETH,
  planShouldConclude,
  planTotals,
  recallReasonFor,
  splitInstallments,
  statusAfter,
} from "@/lib/odonto";
import { libraryFor } from "@/lib/anamnesis-library";

describe("numeração FDI", () => {
  it("32 permanentes e 20 decíduos, sem repetição", () => {
    expect(new Set(PERMANENT_TEETH).size).toBe(32);
    expect(new Set(DECIDUOUS_TEETH).size).toBe(20);
    expect(isValidTooth(11) && isValidTooth(48) && isValidTooth(55) && isValidTooth(85)).toBe(true);
    expect(isValidTooth(19)).toBe(false);
    expect(isValidTooth(56)).toBe(false);
    expect(isValidTooth(10)).toBe(false);
    expect(isValidTooth(16.5)).toBe(false);
  });
  it("anteriores: incisivos e caninos", () => {
    expect([11, 13, 23, 33, 41, 53].every(isAnterior)).toBe(true);
    expect([14, 16, 26, 36, 48, 55].some(isAnterior)).toBe(false);
  });
});

describe("faces", () => {
  it("ordem clínica, sem repetir, B vira V", () => {
    expect(normalizeFaces("dom", 16)).toBe("MOD");
    expect(normalizeFaces("M,O,D,M", 36)).toBe("MOD");
    expect(normalizeFaces("bl", 46)).toBe("VL");
    expect(normalizeFaces("xyz", 16)).toBeNull();
  });
  it("anterior não tem oclusal e posterior não tem incisal", () => {
    expect(normalizeFaces("MO", 11)).toBe("MI");
    expect(normalizeFaces("MI", 16)).toBe("MO");
  });
});

describe("plano e orçamento", () => {
  const items = [
    { price: 280, status: "planejado" },
    { price: 1450.5, status: "realizado" },
    { price: 900, status: "cancelado" },
  ];
  it("totais ignoram cancelados; desconto nunca maior que o bruto", () => {
    expect(planTotals(items, 30.5)).toMatchObject({ gross: 1730.5, discount: 30.5, net: 1700, done: 1450.5, remaining: 280, count: 2, doneCount: 1 });
    expect(planTotals(items, 99999).net).toBe(0);
    expect(planTotals(items, -10).discount).toBe(0);
  });
  it("parcelas em centavos, diferença na primeira, mês a mês com dia âncora", () => {
    const p = splitInstallments(100, 3, "2026-01-31");
    expect(p.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(p.map((x) => x.dueKey)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(splitInstallments(1700, 0, "2026-10-10")).toHaveLength(1);
    expect(splitInstallments(1700, 99, "2026-10-10")).toHaveLength(24);
    const sum = splitInstallments(1234.56, 7, "2026-10-10").reduce((s, x) => s + Math.round(x.amount * 100), 0);
    expect(sum).toBe(123456);
  });
  it("conclui quando não sobra planejado e houve ao menos um realizado", () => {
    expect(planShouldConclude([{ status: "realizado" }, { status: "cancelado" }])).toBe(true);
    expect(planShouldConclude([{ status: "realizado" }, { status: "planejado" }])).toBe(false);
    expect(planShouldConclude([{ status: "cancelado" }])).toBe(false);
  });
  it("resultado no dente e motivo do retorno", () => {
    expect(statusAfter("endodontia")).toBe("endodontia");
    expect(statusAfter("ausente")).toBe("ausente");
    expect(recallReasonFor("periodontia")).toBe("periodontal");
    expect(recallReasonFor("prevencao")).toBe("profilaxia");
    expect(recallReasonFor("dentistica")).toBe("revisao");
  });
});

describe("laboratório", () => {
  it("atrasado só se aberto e com prazo vencido", () => {
    expect(labOverdue({ status: "enviado", dueKey: "2026-10-01" }, "2026-10-10")).toBe(true);
    expect(labOverdue({ status: "recebido", dueKey: "2026-10-01" }, "2026-10-10")).toBe(false);
    expect(labOverdue({ status: "enviado", dueKey: "2026-10-10" }, "2026-10-10")).toBe(false);
    expect(labOverdue({ status: "enviado", dueKey: null }, "2026-10-10")).toBe(false);
  });
});

describe("área Odonto", () => {
  it("módulos, segmentos, conselho e anamnese da área", () => {
    expect(areaOf("odonto")).toBe("odonto");
    expect(moduleEnabled("odonto", "odontograma")).toBe(true);
    expect(moduleEnabled("odonto", "protese")).toBe(true);
    expect(moduleEnabled("odonto", "cartao_diario")).toBe(false);
    expect(moduleEnabled("mental", "odontograma")).toBe(false);
    expect(moduleEnabled({ area: "mental", modulesAdded: ["odontograma"] }, "odontograma")).toBe(true);
    expect(AREAS.odonto.councils).toEqual(["CRO"]);
    expect(areaOfSegment("odonto_ortodontia")).toBe("odonto");
    expect(areaOfSegment("odonto")).toBe("mental");
    expect(professionalDefaults("odonto_endodontia")).toEqual({ type: "dentista", council: "CRO" });
    expect(libraryFor("odonto").map((t) => t.slug)).toEqual(["odontologia", "odontopediatria"]);
    expect(libraryFor("mental").some((t) => t.slug === "odontopediatria")).toBe(false);
  });
});
