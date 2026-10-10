import { describe, expect, it } from "vitest";
import { carneLeao, carneLeaoCsv, carneLeaoDue, factorR, lastBusinessDay, moneyInWords, obligationsFor, progressiveTax, reduction2026 } from "@/lib/tax";

describe("tabela progressiva 2026 e redutor", () => {
  it("faixas", () => {
    expect(progressiveTax(2000)).toBe(0);
    expect(progressiveTax(2428.8)).toBe(0);
    expect(progressiveTax(2800)).toBe(27.84); // 2800 × 7,5% − 182,16
    expect(progressiveTax(3500)).toBe(130.84); // × 15% − 394,16
    expect(progressiveTax(4000)).toBe(224.51); // × 22,5% − 675,49
    expect(progressiveTax(10000)).toBe(1841.27); // × 27,5% − 908,73
  });
  it("redutor: até 5 mil zera até R$ 312,89; até 7.350 decresce; acima, nada", () => {
    expect(reduction2026(5000, 400)).toBe(312.89);
    expect(reduction2026(4000, 100)).toBe(100);
    expect(reduction2026(6000, 900)).toBe(179.75); // 978,62 − 0,133145 × 6000
    expect(reduction2026(8000, 1300)).toBe(0);
  });
});

describe("carnê-leão mensal", () => {
  it("livro-caixa deduz à parte e soma com o desconto simplificado", () => {
    const r = carneLeao({ income: 5000, livroCaixa: 200, inss: 0, dependents: 0 });
    expect(r.useSimplified).toBe(true);
    expect(r.deductions).toBe(807.2); // 200 + 607,20
    expect(r.base).toBe(4192.8);
    expect(r.gross).toBe(267.89); // 4192,80 × 22,5% − 675,49
    expect(r.tax).toBe(0); // redutor zera até 5 mil de rendimento
  });
  it("INSS e dependentes abaixo do simplificado: vale o simplificado, mais o livro-caixa", () => {
    const r = carneLeao({ income: 9000, livroCaixa: 1800, inss: 178.31, dependents: 1 });
    expect(r.legal).toBe(367.9);
    expect(r.useSimplified).toBe(true);
    expect(r.deductions).toBe(2407.2);
    expect(r.base).toBe(6592.8);
    expect(r.gross).toBe(904.29); // 6592,80 × 27,5% − 908,73
    expect(r.reduction).toBe(0);
    expect(r.tax).toBe(904.29);
  });
  it("INSS e dependentes acima do simplificado: usa as deduções legais, mais o livro-caixa", () => {
    const r = carneLeao({ income: 9000, livroCaixa: 1800, inss: 500, dependents: 2 });
    expect(r.useSimplified).toBe(false);
    expect(r.deductions).toBe(2679.18); // 1800 + 500 + 2 × 189,59
    expect(r.base).toBe(6320.82);
  });
  it("livro-caixa maior que o rendimento só zera a base (o excedente vai para o mês seguinte)", () => {
    const r = carneLeao({ income: 1000, livroCaixa: 3000, inss: 0, dependents: 0 });
    expect(r.livroCaixa).toBe(1000);
    expect(r.simplified).toBe(0);
    expect(r.base).toBe(0);
  });
  it("sem rendimento, sem imposto", () => {
    expect(carneLeao({ income: 0, livroCaixa: 500, inss: 0, dependents: 0 }).tax).toBe(0);
  });
});

describe("vencimentos", () => {
  it("último dia útil do mês (fim de semana e feriado)", () => {
    expect(lastBusinessDay("2026-01")).toBe("2026-01-30"); // 31/01/2026 é sábado
    expect(lastBusinessDay("2026-10")).toBe("2026-10-30"); // 31/10/2026 é sábado
  });
  it("DARF do carnê-leão: último dia útil do mês seguinte", () => {
    expect(carneLeaoDue("2026-09")).toBe("2026-10-30");
    expect(carneLeaoDue("2026-12")).toBe("2027-01-29"); // 30 e 31/01/2027 caem no fim de semana
  });
  it("obrigações por regime", () => {
    expect(obligationsFor("pf", "2026-09").map((o) => o.key)).toEqual(["inss", "carneLeao", "receitaSaude"]);
    expect(obligationsFor("pf", "2026-09")[0].dueKey).toBe("2026-10-15");
    // Estética não emite Receita Saúde.
    expect(obligationsFor("pf", "2026-09", { receitaSaude: false }).map((o) => o.key)).toEqual(["inss", "carneLeao"]);
    expect(obligationsFor("simples", "2026-09")).toEqual([{ key: "das", dueKey: "2026-10-20" }]);
    expect(obligationsFor("simples", "2026-12").map((o) => o.key)).toEqual(["das", "dmed"]);
  });
  it("GPS e DAS prorrogam para o dia útil seguinte", () => {
    // 15/11/2026 é domingo e feriado: a GPS vai para segunda, 16/11.
    expect(obligationsFor("pf", "2026-10").find((o) => o.key === "inss")?.dueKey).toBe("2026-11-16");
    // 20/03/2027 é sábado: o DAS vai para segunda, 22/03.
    expect(obligationsFor("simples", "2027-02")[0].dueKey).toBe("2027-03-22");
  });
});

describe("fator R", () => {
  it("28% ou mais vai para o Anexo III", () => {
    expect(factorR(30000, 100000)).toMatchObject({ anexo: "III", payrollFor28: 0 });
    expect(factorR(20000, 100000)).toMatchObject({ anexo: "V", payrollFor28: 8000 });
    expect(factorR(1000, 0).ratio).toBeNull();
  });
});

describe("CSV do Carnê-Leão Web / Receita Saúde", () => {
  it("16 campos com ';', valor sem milhar, indicador S; sem CPF fica de fora", () => {
    const out = carneLeaoCsv(
      [
        { paidKey: "2026-09-05", amount: 1250.5, payerName: "Ana; Souza", payerCpf: "529.982.247-25", description: "Sessão de psicoterapia" },
        { paidKey: "2026-09-06", amount: 200, payerName: "Bruno", payerCpf: null, description: "Sessão" },
      ],
      { occupation: "255", professionalCpf: "111.444.777-35", council: "CRP 06/12345", receitaSaude: true },
    );
    expect(out.count).toBe(1);
    expect(out.missing.map((m) => m.payerName)).toEqual(["Bruno"]);
    const fields = out.csv.trim().split(";");
    expect(fields).toHaveLength(16);
    expect(fields.slice(0, 4)).toEqual(["05/09/2026", "R01.001.001", "255", "1250,50"]);
    expect(fields[6]).toBe("Ana Souza");
    expect(fields[7]).toBe("52998224725");
    expect(fields[13]).toBe("S");
    expect(fields[14]).toBe("11144477735");
  });
  it("menor de idade: responsável paga, paciente é o beneficiário (campo 9); CPF com dígito errado fica de fora", () => {
    const out = carneLeaoCsv(
      [
        { paidKey: "2026-09-05", amount: 300, payerName: "Mãe", payerCpf: "111.444.777-35", beneficiaryCpf: "529.982.247-25", description: "Sessão" },
        { paidKey: "2026-09-06", amount: 300, payerName: "Errado", payerCpf: "529.982.247-24", description: "Sessão" },
      ],
      { occupation: "255", professionalCpf: "390.533.447-05", council: null, receitaSaude: false },
    );
    expect(out.count).toBe(1);
    expect(out.missing.map((m) => m.payerName)).toEqual(["Errado"]);
    const fields = out.csv.trim().split(";");
    expect(fields[7]).toBe("11144477735");
    expect(fields[8]).toBe("52998224725");
    expect(fields[13]).toBe(""); // sem Receita Saúde (estética), o indicador fica vazio
  });
});

describe("valor por extenso", () => {
  it.each([
    [1, "um real"],
    [0.5, "cinquenta centavos"],
    [100, "cem reais"],
    [101, "cento e um reais"],
    [250.5, "duzentos e cinquenta reais e cinquenta centavos"],
    [1000, "mil reais"],
    [1100, "mil e cem reais"],
    [1250, "mil duzentos e cinquenta reais"],
    [2020, "dois mil e vinte reais"],
    [21345.01, "vinte e um mil trezentos e quarenta e cinco reais e um centavo"],
    [1000000, "um milhão de reais"],
  ])("%s → %s", (v, words) => {
    expect(moneyInWords(v)).toBe(words);
  });
});
