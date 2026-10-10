// Fiscal do profissional de saúde (regras puras, sem banco). Fontes:
// - Tabela progressiva mensal do IRPF 2026 (Lei 15.191/2025) e redutor (Lei 15.270/2025: até R$ 5.000 de rendimento
//   tributável reduz até R$ 312,89; de R$ 5.000,01 a R$ 7.350, R$ 978,62 − 0,133145 × rendimento; acima, nada).
// - Desconto simplificado mensal R$ 607,20 no lugar das deduções; dependente R$ 189,59.
// - Carnê-leão: DARF 0190, vence no último dia útil do mês seguinte ao recebimento.
// - Manual Receita Saúde / Carnê-Leão Web: importação CSV com ";" e 16 campos.
// - INSS contribuinte individual (dia 15), DAS (dia 20), DMED (último dia útil de fevereiro), fator R do Simples (28%).
// O resultado é estimativa para conferência: a apuração oficial é a do Carnê-Leão Web.
import { isValidCpf } from "./cpf";
import { addMonthsKey, isBusinessDay } from "./payables";

const cents = (v: number) => Math.round(v * 100);
const reais = (c: number) => Math.round(c) / 100;

export const IRPF_MONTHLY_2026 = [
  { upTo: 2428.8, rate: 0, deduction: 0 },
  { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
  { upTo: 3751.05, rate: 0.15, deduction: 394.16 },
  { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
  { upTo: Infinity, rate: 0.275, deduction: 908.73 },
] as const;
export const SIMPLIFIED_MONTHLY = 607.2;
export const DEPENDENT_MONTHLY = 189.59;

// Imposto pela tabela progressiva sobre a base de cálculo.
export function progressiveTax(base: number) {
  if (base <= 0) return 0;
  const b = IRPF_MONTHLY_2026.find((x) => base <= x.upTo)!;
  return Math.max(0, reais(cents(base * b.rate - b.deduction)));
}

// Redução de 2026, calculada sobre o rendimento tributável (não sobre a base), limitada ao imposto.
export function reduction2026(taxableIncome: number, tax: number) {
  const r = taxableIncome <= 5000 ? 312.89 : taxableIncome <= 7350 ? 978.62 - 0.133145 * taxableIncome : 0;
  return Math.min(tax, Math.max(0, reais(cents(r))));
}

export type CarneLeaoInput = {
  income: number; // rendimentos de pessoas físicas no mês (recebidos)
  livroCaixa: number; // despesas de custeio dedutíveis pagas no mês
  inss: number; // previdência oficial paga no mês
  dependents: number;
  alimony?: number; // pensão alimentícia judicial paga no mês
};

// Apuração mensal. O livro-caixa (despesas de custeio, Lei 9.250 art. 4º I) sempre deduz, limitado ao rendimento; o
// desconto simplificado substitui só as deduções legais dos incisos II a V (INSS, dependentes, pensão): vale o maior.
// "livroCaixa" já é o valor do mês depois do excedente que vem dos meses anteriores (ver livroCaixa() em payables.ts).
export function carneLeao(i: CarneLeaoInput) {
  const income = Math.max(0, i.income);
  const book = Math.min(Math.max(0, i.livroCaixa), income);
  const legal = reais(cents(Math.max(0, i.inss)) + cents(Math.max(0, i.dependents) * DEPENDENT_MONTHLY) + cents(Math.max(0, i.alimony ?? 0)));
  const afterBook = reais(cents(income - book));
  const simplified = Math.min(SIMPLIFIED_MONTHLY, afterBook);
  const useSimplified = simplified > legal;
  const other = useSimplified ? simplified : Math.min(legal, afterBook);
  const deductions = reais(cents(book) + cents(other));
  const base = reais(cents(income - deductions));
  const gross = progressiveTax(base);
  const red = reduction2026(income, gross);
  const tax = reais(cents(gross - red));
  return { income, livroCaixa: book, legal, simplified, useSimplified, deductions, base, gross, reduction: red, tax, effectiveRate: income ? tax / income : 0 };
}

// Último dia útil de um mês ("AAAA-MM").
export function lastBusinessDay(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  let d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const key = (day: number) => `${monthKey}-${String(day).padStart(2, "0")}`;
  while (!isBusinessDay(key(d))) d--;
  return key(d);
}
// GPS do contribuinte individual (Lei 8.212, art. 30, II) e DAS (Res. CGSN 140) prorrogam para o dia útil seguinte.
const nextBusinessDay = (dayKey: string) => {
  let k = dayKey;
  while (!isBusinessDay(k)) {
    const d = new Date(`${k}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    k = d.toISOString().slice(0, 10);
  }
  return k;
};
export const nextMonth = (monthKey: string) => addMonthsKey(`${monthKey}-01`, 1).slice(0, 7);

// DARF 0190 do carnê-leão do mês: último dia útil do mês seguinte.
export const carneLeaoDue = (monthKey: string) => lastBusinessDay(nextMonth(monthKey));

export const TAX_REGIMES = ["pf", "simples", "presumido"] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

// Obrigações do mês de competência, por regime. PF: carnê-leão (DARF 0190); recibos da Receita Saúde do mês escriturados
// antes de gerar o DARF (emitidos no recebimento; não vale para estética); INSS individual (GPS, dia 15, prorroga).
// PJ: DAS (dia 20, prorroga) no Simples; DMED (último dia útil de fevereiro) para quem é PJ de saúde.
export function obligationsFor(regime: TaxRegime, monthKey: string, opts: { receitaSaude?: boolean } = {}) {
  const next = nextMonth(monthKey);
  const list: { key: string; dueKey: string }[] = [];
  if (regime === "pf") {
    list.push({ key: "carneLeao", dueKey: carneLeaoDue(monthKey) });
    if (opts.receitaSaude !== false) list.push({ key: "receitaSaude", dueKey: carneLeaoDue(monthKey) });
    list.push({ key: "inss", dueKey: nextBusinessDay(`${next}-15`) });
  } else {
    if (regime === "simples") list.push({ key: "das", dueKey: nextBusinessDay(`${next}-20`) });
    if (monthKey.endsWith("-12")) list.push({ key: "dmed", dueKey: lastBusinessDay(`${Number(monthKey.slice(0, 4)) + 1}-02`) });
  }
  return list.sort((a, b) => a.dueKey.localeCompare(b.dueKey));
}

// Fator R (Simples Nacional): folha (salários, pró-labore e encargos) ÷ receita bruta, nos últimos 12 meses.
// Com 28% ou mais, serviços de saúde vão para o Anexo III (alíquota inicial 6%) em vez do Anexo V (15,5%).
export function factorR(payroll12: number, revenue12: number) {
  if (revenue12 <= 0) return { ratio: null, anexo: null as "III" | "V" | null, payrollFor28: 0 };
  const ratio = payroll12 / revenue12;
  return { ratio, anexo: ratio >= 0.28 ? ("III" as const) : ("V" as const), payrollFor28: Math.max(0, reais(cents(revenue12 * 0.28 - payroll12))) };
}

// ---------------- Carnê-Leão Web / Receita Saúde (importação CSV) ----------------

export const RENDIMENTO_TRABALHO_PF = "R01.001.001";
// Código de ocupação do Carnê-Leão Web sugerido por área (psicólogo: 255). Nas outras áreas o profissional informa.
export const DEFAULT_OCCUPATION = { mental: "255" } as Record<string, string | undefined>;
// Receita Saúde vale para profissionais de saúde; procedimento estético não é despesa médica dedutível.
export const receitaSaudeApplies = (area: string, regime: string) => regime === "pf" && area !== "estetica";

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const brDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
const csvMoney = (v: number) => (cents(v) / 100).toFixed(2).replace(".", ",");
const clean = (s: string, max: number) => s.replace(/[;\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Pagador (quem pagou, em geral o próprio paciente ou o responsável) e beneficiário (o paciente, quando é outra pessoa).
export type ReceiptRow = { paidKey: string; amount: number; payerName: string; payerCpf: string | null; beneficiaryCpf?: string | null; description: string };

// Linhas do CSV (16 campos, ";"): data, código do rendimento, ocupação, valor, dedução, descrição, recebido de, CPF do
// pagador, CPF do beneficiário, indicador CPF não informado, CNPJ, indicador IRRF, IRRF, indicador de recibo
// ("S" gera o recibo da Receita Saúde), CPF do profissional, registro profissional. Sem CPF do pagador a linha fica de fora
// (a Receita Saúde exige) e volta na lista de pendências.
export function carneLeaoCsv(rows: ReceiptRow[], opts: { occupation: string; professionalCpf: string; council?: string | null; receitaSaude: boolean }) {
  const ok: string[] = [];
  const missing: ReceiptRow[] = [];
  for (const r of rows) {
    const cpf = digits(r.payerCpf);
    const beneficiary = digits(r.beneficiaryCpf);
    if (!isValidCpf(cpf) || (beneficiary && !isValidCpf(beneficiary))) {
      missing.push(r);
      continue;
    }
    ok.push(
      [
        brDate(r.paidKey),
        RENDIMENTO_TRABALHO_PF,
        opts.occupation,
        csvMoney(r.amount),
        "",
        clean(r.description, 255),
        clean(r.payerName, 120),
        cpf,
        beneficiary && beneficiary !== cpf ? beneficiary : "",
        "",
        "",
        "",
        "",
        opts.receitaSaude ? "S" : "",
        digits(opts.professionalCpf),
        clean(opts.council ?? "", 20),
      ].join(";"),
    );
  }
  return { csv: ok.join("\r\n") + (ok.length ? "\r\n" : ""), count: ok.length, missing };
}

// ---------------- Valor por extenso (recibo) ----------------

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function upTo999(n: number): string {
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(r < 20 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNITS[r % 10]}` : ""));
  return parts.join(" e ");
}

function integerWords(n: number): string {
  if (n === 0) return "zero";
  const groups = [
    { v: Math.floor(n / 1_000_000) % 1000, one: "um milhão", many: "milhões" },
    { v: Math.floor(n / 1000) % 1000, one: "mil", many: "mil" },
    { v: n % 1000, one: "", many: "" },
  ];
  const parts: string[] = [];
  groups.forEach((g, i) => {
    if (!g.v) return;
    if (i === 0) parts.push(g.v === 1 ? g.one : `${upTo999(g.v)} ${g.many}`);
    else if (i === 1) parts.push(g.v === 1 ? "mil" : `${upTo999(g.v)} mil`);
    else parts.push(upTo999(g.v));
  });
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (mil e cem; mil e vinte).
  if (parts.length > 1) {
    const last = n % 1000;
    if (last && (last < 100 || last % 100 === 0)) return parts.slice(0, -1).join(" ") + " e " + parts[parts.length - 1];
  }
  return parts.join(" ");
}

// "R$ 1.250,50" → "mil duzentos e cinquenta reais e cinquenta centavos". Sempre em português: o recibo é documento
// fiscal brasileiro, mesmo com a interface em outro idioma.
export function moneyInWords(value: number) {
  const c = Math.max(0, cents(value));
  const int = Math.floor(c / 100);
  const dec = c % 100;
  const millions = int >= 1_000_000 && int % 1_000_000 === 0;
  const r = int ? `${integerWords(int)}${millions ? " de" : ""} ${int === 1 ? "real" : "reais"}` : "";
  const d = dec ? `${integerWords(dec)} ${dec === 1 ? "centavo" : "centavos"}` : "";
  return [r, d].filter(Boolean).join(" e ") || "zero real";
}
