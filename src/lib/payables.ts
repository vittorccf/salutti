// Regras puras de contas a pagar (sem banco): parcelas, recorrência, situação, totais e exportação.
// Valores sempre em centavos (inteiros) para não acumular erro de arredondamento.
// Datas de vencimento e competência circulam como chave "AAAA-MM-DD" (dia em São Paulo).

export const FREQUENCIES = ["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const PAYMENT_METHODS = ["boleto", "pix", "transferencia", "cartao_credito", "cartao_debito", "debito_automatico", "dinheiro"] as const;
export const ATTACHMENT_KINDS = ["boleto", "nota_fiscal", "comprovante", "contrato", "outro"] as const;

// Grupos do plano de contas (ordem da DRE).
export const CATEGORY_GROUPS = ["ocupacao", "pessoal", "profissional", "administrativo", "marketing", "materiais", "impostos", "financeiro", "outros"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

// Limite de ocorrências geradas de uma vez (parcelas ou repetições).
export const MAX_OCCURRENCES = 120;

const MONTHS: Partial<Record<Frequency, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
const DAYS: Partial<Record<Frequency, number>> = { weekly: 7, biweekly: 14 };

const pad = (n: number) => String(n).padStart(2, "0");
const parseKey = (key: string) => key.split("-").map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Soma meses mantendo o dia âncora: 31/01 + 1 mês = 28 ou 29/02; + 2 meses = 31/03 (não "escorrega" para o dia 28).
export function addMonthsKey(key: string, months: number) {
  const [y, m, d] = parseKey(key);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

export function addDaysKey(key: string, days: number) {
  const [y, m, d] = parseKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// i-ésima data da série (0 = a primeira), sempre calculada a partir da primeira para não perder o dia âncora.
export function occurrenceDate(first: string, frequency: Frequency, index: number) {
  const months = MONTHS[frequency];
  return months ? addMonthsKey(first, months * index) : addDaysKey(first, (DAYS[frequency] ?? 0) * index);
}

// Datas da série: por quantidade ou até uma data final (inclusive), no máximo MAX_OCCURRENCES.
export function seriesDates(first: string, frequency: Frequency, opts: { count?: number; until?: string }) {
  const out: string[] = [];
  const limit = Math.min(opts.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  for (let i = 0; i < limit; i++) {
    const date = occurrenceDate(first, frequency, i);
    if (opts.until && date > opts.until) break;
    out.push(date);
  }
  return out;
}

// Divide o total em n parcelas iguais; os centavos que sobram vão para as primeiras.
export function splitInstallments(totalCents: number, n: number) {
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

// Fim de semana (sábado/domingo) no dia da chave.
export const isWeekend = (key: string) => {
  const [y, m, d] = parseKey(key);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
};

// "1.234,56", "1234.56", "R$ 49,90" → centavos. Vírgula é decimal; ponto só é decimal quando não há vírgula
// e há no máximo 2 casas depois dele.
export function parseMoneyToCents(value: string): number | null {
  const s = value.replace(/[^\d,.-]/g, "");
  if (!s || s === "-") return null;
  let normalized: string;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{1,2}$/.test(s) && (s.match(/\./g) ?? []).length === 1) normalized = s;
  else normalized = s.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export type PaymentLike = { principalCents: number; interestCents: number; fineCents: number; discountCents: number; reversedAt?: Date | null };
export type PayableLike = { amountCents: number; dueDate: string; cancelledAt?: Date | null; payments: PaymentLike[] };

// Principal abatido pelos pagamentos válidos (estornados não contam).
export const paidPrincipal = (payments: PaymentLike[]) =>
  payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.principalCents, 0);

// O que saiu do caixa: principal + juros + multa - desconto.
export const paymentOutflow = (p: PaymentLike) => p.principalCents + p.interestCents + p.fineCents - p.discountCents;

export const remainingCents = (p: PayableLike) => Math.max(0, p.amountCents - paidPrincipal(p.payments));

export type PayableStatus = "cancelled" | "paid" | "partial" | "overdue" | "due_today" | "open";

export function payableStatus(p: PayableLike, today: string): PayableStatus {
  if (p.cancelledAt) return "cancelled";
  const paid = paidPrincipal(p.payments);
  if (paid >= p.amountCents) return "paid";
  if (p.dueDate < today) return "overdue";
  if (paid > 0) return "partial";
  return p.dueDate === today ? "due_today" : "open";
}

// Principal de um pagamento a partir do que foi pago de fato: quem paga 110 com 10 de juros abate 100;
// quem paga 95 com 5 de desconto também abate 100.
export const principalFromPaid = (paidCents: number, interest: number, fine: number, discount: number) =>
  paidCents - interest - fine + discount;

// CSV com ";" (o Excel em português abre direto) e BOM para os acentos.
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Fórmula começando em = + - @ vira texto (injeção de fórmula no Excel).
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

export const centsToCsv = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), base dos feriados móveis.
function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Dias sem expediente bancário em todo o país: feriados nacionais (20/11 desde 2024), Carnaval (segunda e terça),
// Sexta-feira Santa e Corpus Christi. Feriados estaduais e municipais ficam de fora.
export function bankHolidays(year: number) {
  const e = easter(year);
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25", ...(year >= 2024 ? ["11-20"] : [])];
  return new Set([
    ...fixed.map((md) => `${year}-${md}`),
    addDaysKey(e, -48),
    addDaysKey(e, -47),
    addDaysKey(e, -2),
    addDaysKey(e, 60),
  ]);
}

export const isBusinessDay = (key: string) => !isWeekend(key) && !bankHolidays(Number(key.slice(0, 4))).has(key);

export const WEEKEND_RULES = ["keep", "next", "previous"] as const;
export type WeekendRule = (typeof WEEKEND_RULES)[number];

// Vencimento em dia sem expediente: manter, ir para o próximo dia útil (regra bancária do boleto) ou antecipar.
export function adjustToBusinessDay(key: string, rule: WeekendRule) {
  if (rule === "keep") return key;
  let d = key;
  while (!isBusinessDay(d)) d = addDaysKey(d, rule === "next" ? 1 : -1);
  return d;
}

// Livro-Caixa do carnê-leão (regime de caixa): a dedução do mês fica limitada à receita do mês e o excedente
// passa para os meses seguintes, só dentro do mesmo ano (em janeiro zera).
export type LivroCaixaMonth = { month: string; incomeCents: number; expensesCents: number };
export function livroCaixa(months: LivroCaixaMonth[]) {
  let carry = 0;
  let year = "";
  return months.map((m) => {
    if (m.month.slice(0, 4) !== year) {
      year = m.month.slice(0, 4);
      carry = 0;
    }
    const available = m.expensesCents + carry;
    const deductedCents = Math.min(available, m.incomeCents);
    const carriedInCents = carry;
    carry = available - deductedCents;
    return { ...m, carriedInCents, deductedCents, carriedOutCents: carry, taxableCents: m.incomeCents - deductedCents };
  });
}

// Perfil do consultório para o plano de contas padrão: psicologia (área "mental"), odontologia (segmento odonto) ou estética.
export type CategoryProfile = "psicologia" | "odonto" | "estetica";
export const categoryProfile = (area: string, segment: string | null | undefined): CategoryProfile =>
  area === "estetica" ? "estetica" : area === "odonto" || segment === "odonto" ? "odonto" : "psicologia";

// Plano de contas padrão. "deductible" é só a sugestão para o Livro-Caixa (despesa de custeio de quem é pessoa física):
// marcadas as que a Receita aceita de forma explícita; nas discutíveis fica "não" e o profissional confirma com o contador.
// "profiles" limita a categoria a alguns perfis (sem o campo, vale para todos).
export const DEFAULT_CATEGORIES: { key: string; name: string; group: CategoryGroup; deductible: boolean; profiles?: CategoryProfile[] }[] = [
  { key: "aluguel", name: "Aluguel ou sublocação de sala (mensal, por turno ou por hora)", group: "ocupacao", deductible: true },
  { key: "condominio", name: "Condomínio", group: "ocupacao", deductible: true },
  { key: "iptu", name: "IPTU do consultório", group: "ocupacao", deductible: true },
  { key: "energia_agua", name: "Energia, água e gás", group: "ocupacao", deductible: true },
  { key: "internet_telefone", name: "Internet e telefone", group: "ocupacao", deductible: true },
  { key: "limpeza_manutencao", name: "Limpeza e manutenção", group: "ocupacao", deductible: true },
  { key: "salarios", name: "Salários de funcionários", group: "pessoal", deductible: true },
  { key: "encargos", name: "Encargos trabalhistas (INSS, FGTS)", group: "pessoal", deductible: true },
  { key: "prolabore", name: "Pró-labore", group: "pessoal", deductible: false },
  { key: "servicos_terceiros", name: "Serviços de terceiros (autônomos)", group: "pessoal", deductible: false },
  { key: "conselho", name: "Anuidade do conselho (CRP, CRO...)", group: "profissional", deductible: true },
  { key: "supervisao", name: "Supervisão clínica", group: "profissional", deductible: false, profiles: ["psicologia"] },
  { key: "cursos", name: "Cursos, congressos e formação", group: "profissional", deductible: false },
  { key: "testes_consumo", name: "Folhas de resposta e protocolos de testes (SATEPSI)", group: "profissional", deductible: true, profiles: ["psicologia"] },
  { key: "livros_testes", name: "Manuais, kits de testes e livros", group: "profissional", deductible: false, profiles: ["psicologia"] },
  { key: "analise_pessoal", name: "Análise pessoal ou psicoterapia (despesa pessoal)", group: "outros", deductible: false, profiles: ["psicologia"] },
  { key: "seguro_rc", name: "Seguro de responsabilidade civil profissional", group: "profissional", deductible: false },
  { key: "contador", name: "Contador", group: "administrativo", deductible: true },
  { key: "software", name: "Software e sistemas", group: "administrativo", deductible: false },
  { key: "teleatendimento", name: "Plataforma de teleatendimento", group: "administrativo", deductible: false, profiles: ["psicologia"] },
  { key: "material_escritorio", name: "Material de escritório e consumo", group: "administrativo", deductible: true },
  { key: "marketing", name: "Divulgação e anúncios", group: "marketing", deductible: false },
  { key: "insumos", name: "Materiais e insumos", group: "materiais", deductible: true, profiles: ["odonto", "estetica"] },
  { key: "laboratorio", name: "Laboratório (prótese e exames)", group: "materiais", deductible: false, profiles: ["odonto"] },
  { key: "das", name: "DAS (Simples Nacional)", group: "impostos", deductible: false },
  { key: "iss", name: "ISS", group: "impostos", deductible: false },
  { key: "inss_individual", name: "INSS (contribuinte individual)", group: "impostos", deductible: false },
  { key: "carne_leao", name: "Carnê-leão (IRPF)", group: "impostos", deductible: false },
  { key: "tarifas", name: "Tarifas bancárias e de maquininha", group: "financeiro", deductible: false },
  { key: "juros_multas", name: "Juros e multas", group: "financeiro", deductible: false },
  { key: "transporte", name: "Deslocamento e transporte", group: "outros", deductible: false },
  { key: "equipamentos", name: "Equipamentos e móveis", group: "outros", deductible: false },
  { key: "outras", name: "Outras despesas", group: "outros", deductible: false },
];

export const defaultCategoriesFor = (profile: CategoryProfile) =>
  DEFAULT_CATEGORIES.filter((c) => !c.profiles || c.profiles.includes(profile));

// Competência de cada ocorrência de uma conta recorrente: anda o mesmo número de meses que o vencimento andou
// desde o primeiro ("2026-10" com vencimentos 10/11 → 10/12 vira "2026-11").
export function shiftCompetence(competence: string, firstDue: string, due: string) {
  const [y, m] = competence.split("-").map(Number);
  const months = (Number(due.slice(0, 4)) - Number(firstDue.slice(0, 4))) * 12 + (Number(due.slice(5, 7)) - Number(firstDue.slice(5, 7)));
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}
