import { describe, expect, it } from "vitest";
import { dueDateFromFactor, formatLinhaDigitavel, mod10, mod11Arrecadacao, parseBoleto } from "@/lib/boleto";
import {
  adjustToBusinessDay,
  bankHolidays,
  isBusinessDay,
  livroCaixa,
  occurrenceDate,
  parseMoneyToCents,
  payableStatus,
  paymentOutflow,
  principalFromPaid,
  remainingCents,
  seriesDates,
  splitInstallments,
  toCsv,
} from "@/lib/payables";

describe("boleto bancário", () => {
  // Exemplo do Banco do Brasil: R$ 1,00, vencimento 31/12/2007 (fator 3737).
  const BB = "00190.50095 40144.816069 06809.350314 3 37370000000100";

  it("confere os DVs e extrai banco, valor e vencimento", () => {
    expect(parseBoleto(BB, "2008-01-10")).toEqual({
      kind: "bancario",
      barcode: "00193373700000001000500940144816060680935031",
      bank: "001",
      amountCents: 100,
      dueDate: "2007-12-31",
    });
  });

  it("recusa DV de campo ou geral errado e tamanho inválido", () => {
    expect(parseBoleto(BB.replace("50095", "50096"), "2008-01-10")).toBe("checkDigit");
    expect(parseBoleto(BB.replace(" 3 ", " 4 "), "2008-01-10")).toBe("checkDigit");
    expect(parseBoleto("123", "2008-01-10")).toBe("length");
  });

  it("fator de vencimento: recomeça em 1000 no dia 22/02/2025 e fica a data mais próxima de hoje", () => {
    expect(dueDateFromFactor(9999, "2025-02-01")).toBe("2025-02-21");
    expect(dueDateFromFactor(1000, "2025-03-01")).toBe("2025-02-22");
    expect(dueDateFromFactor(1001, "2025-03-01")).toBe("2025-02-23");
    expect(dueDateFromFactor(1000, "2000-07-01")).toBe("2000-07-03");
    expect(dueDateFromFactor(0, "2025-03-01")).toBeNull();
  });

  it("formata a linha em blocos", () => {
    expect(formatLinhaDigitavel(BB)).toBe("00190.50095 40144.816069 06809.350314 3 37370000000100");
  });
});

describe("arrecadação (48 dígitos)", () => {
  // Monta uma linha válida a partir do código de barras (DV geral e dos blocos), como o banco faz.
  const build = (third: string, value11: string, rest: string) => {
    const useMod10 = third === "6" || third === "7";
    const dv = (s: string) => (useMod10 ? mod10(s) : mod11Arrecadacao(s));
    const noDv = `8${"2"}${third}${value11}${rest}`; // 43 dígitos
    const barcode = noDv.slice(0, 3) + dv(noDv) + noDv.slice(3);
    return [0, 11, 22, 33].map((i) => barcode.slice(i, i + 11) + dv(barcode.slice(i, i + 11))).join("");
  };
  const rest = "0001234567890123456789012345678901".slice(0, 29);

  it("valor efetivo (6) com módulo 10", () => {
    const line = build("6", "00000015990", rest);
    const parsed = parseBoleto(line, "2026-10-09");
    expect(parsed).toMatchObject({ kind: "arrecadacao", segment: "2", amountCents: 15990, dueDate: null });
  });

  it("valor efetivo (8) com módulo 11; referência (7) não traz valor", () => {
    expect(parseBoleto(build("8", "00000004250", rest), "2026-10-09")).toMatchObject({ amountCents: 4250 });
    expect(parseBoleto(build("7", "00000004250", rest), "2026-10-09")).toMatchObject({ amountCents: null });
  });

  it("recusa bloco com DV errado", () => {
    const line = build("6", "00000015990", rest);
    const broken = line.slice(0, 11) + ((Number(line[11]) + 1) % 10) + line.slice(12);
    expect(parseBoleto(broken, "2026-10-09")).toBe("checkDigit");
  });
});

describe("datas da série", () => {
  it("mensal mantém o dia âncora (31 → fim do mês curto → 31 de novo)", () => {
    expect(seriesDates("2026-01-31", "monthly", { count: 4 })).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrenceDate("2028-01-31", "monthly", 1)).toBe("2028-02-29");
  });

  it("semanal, quinzenal, anual e limite por data", () => {
    expect(seriesDates("2026-10-09", "weekly", { count: 3 })).toEqual(["2026-10-09", "2026-10-16", "2026-10-23"]);
    expect(seriesDates("2026-12-25", "biweekly", { count: 2 })).toEqual(["2026-12-25", "2027-01-08"]);
    expect(seriesDates("2024-02-29", "yearly", { count: 2 })).toEqual(["2024-02-29", "2025-02-28"]);
    expect(seriesDates("2026-01-10", "quarterly", { until: "2026-10-10" })).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
    expect(seriesDates("2026-01-10", "monthly", {}).length).toBe(120);
  });

  it("feriados bancários e dia útil", () => {
    const h = bankHolidays(2026);
    // Páscoa de 2026: 05/04 → Carnaval 16 e 17/02, Sexta-feira Santa 03/04, Corpus Christi 04/06.
    for (const d of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-11-20", "2026-12-25"]) expect(h.has(d)).toBe(true);
    expect(isBusinessDay("2026-10-12")).toBe(false);
    expect(adjustToBusinessDay("2026-10-10", "next")).toBe("2026-10-13"); // sábado → (12/10 feriado) → terça
    expect(adjustToBusinessDay("2026-10-11", "previous")).toBe("2026-10-09");
    expect(adjustToBusinessDay("2026-10-11", "keep")).toBe("2026-10-11");
  });
});

describe("valores", () => {
  it("divide parcelas sem perder centavos", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b)).toBe(10000);
  });

  it("lê valores no formato brasileiro e no americano", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 49,90")).toBe(4990);
    expect(parseMoneyToCents("49.90")).toBe(4990);
    expect(parseMoneyToCents("1.234")).toBe(123400);
    expect(parseMoneyToCents("")).toBeNull();
  });

  it("baixa: principal, o que saiu do caixa e situação", () => {
    expect(principalFromPaid(11000, 1000, 0, 0)).toBe(10000);
    expect(principalFromPaid(9500, 0, 0, 500)).toBe(10000);
    const pay = { principalCents: 4000, interestCents: 100, fineCents: 200, discountCents: 0 };
    expect(paymentOutflow(pay)).toBe(4300);

    const base = { amountCents: 10000, dueDate: "2026-10-09", payments: [] as (typeof pay & { reversedAt?: Date | null })[] };
    expect(payableStatus(base, "2026-10-08")).toBe("open");
    expect(payableStatus(base, "2026-10-09")).toBe("due_today");
    expect(payableStatus(base, "2026-10-10")).toBe("overdue");
    expect(payableStatus({ ...base, payments: [pay] }, "2026-10-08")).toBe("partial");
    expect(remainingCents({ ...base, payments: [pay] })).toBe(6000);
    expect(payableStatus({ ...base, payments: [{ ...pay, principalCents: 10000 }] }, "2026-10-20")).toBe("paid");
    expect(payableStatus({ ...base, payments: [{ ...pay, principalCents: 10000, reversedAt: new Date() }] }, "2026-10-08")).toBe("open");
    expect(payableStatus({ ...base, cancelledAt: new Date() }, "2026-10-20")).toBe("cancelled");
  });
});

describe("Livro-Caixa", () => {
  it("limita a dedução à receita do mês, leva o excedente e zera na virada do ano", () => {
    const rows = livroCaixa([
      { month: "2026-11", incomeCents: 1000, expensesCents: 1500 },
      { month: "2026-12", incomeCents: 2000, expensesCents: 1000 },
      { month: "2027-01", incomeCents: 500, expensesCents: 800 },
      { month: "2027-02", incomeCents: 500, expensesCents: 0 },
    ]);
    expect(rows.map((r) => [r.deductedCents, r.carriedOutCents, r.taxableCents])).toEqual([
      [1000, 500, 0],
      [1500, 0, 500],
      [500, 300, 0],
      [300, 0, 200],
    ]);
  });
});

describe("CSV", () => {
  it("separa por ponto e vírgula, aspas quando precisa e neutraliza fórmula", () => {
    const csv = toCsv([["Descrição", "Valor"], ['Aluguel; sala "A"', "-10,50"], ["=HYPERLINK(1)", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Aluguel; sala ""A""";-10,50');
    expect(csv).toContain("'=HYPERLINK(1);");
  });
});

describe("plano de contas e competência", () => {
  it("competência da recorrência anda com o vencimento", async () => {
    const { shiftCompetence } = await import("@/lib/payables");
    expect(shiftCompetence("2026-10", "2026-10-10", "2026-10-10")).toBe("2026-10");
    expect(shiftCompetence("2026-10", "2026-10-10", "2027-01-10")).toBe("2027-01");
    // Competência anterior ao vencimento (aluguel de setembro vence em outubro) continua um mês atrás.
    expect(shiftCompetence("2026-09", "2026-10-05", "2026-12-05")).toBe("2026-11");
  });

  it("categorias padrão pelo perfil do consultório", async () => {
    const { categoryProfile, defaultCategoriesFor } = await import("@/lib/payables");
    expect(categoryProfile("mental", "solo_psicologo")).toBe("psicologia");
    expect(categoryProfile("mental", "odonto")).toBe("odonto");
    expect(categoryProfile("estetica", null)).toBe("estetica");
    const keys = (p: "psicologia" | "odonto" | "estetica") => defaultCategoriesFor(p).map((c) => c.key);
    expect(keys("psicologia")).toEqual(expect.arrayContaining(["supervisao", "testes_consumo", "teleatendimento", "seguro_rc"]));
    expect(keys("psicologia")).not.toContain("insumos");
    expect(keys("odonto")).toEqual(expect.arrayContaining(["insumos", "laboratorio"]));
    expect(keys("odonto")).not.toContain("supervisao");
    expect(keys("estetica")).toContain("insumos");
    expect(keys("estetica")).not.toContain("laboratorio");
  });
});
