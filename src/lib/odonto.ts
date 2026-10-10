// Salutti Odonto: regras puras (sem banco). Referências: Res. CFO 174/92 (prontuário com numeração dentária FDI,
// plano e evolução do tratamento), Padrão TISS/TUSS (GTO: dente/região obrigatório quando o procedimento é por dente;
// faces de restauração contadas por elemento), sistemas de mercado (Simples Dental, Clinicorp, NewSoft: orçamento nasce
// do odontograma, com estados em estudo → aprovado → concluído) e manutenção periodontal em 3, 4 ou 6 meses.
import { addMonthsKey } from "./payables";

const range = (a: number, b: number) => {
  const r: number[] = [];
  for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) r.push(i);
  return r;
};

// Quadrantes na visão do dentista, de frente para o paciente: superior 18→11 | 21→28, inferior 48→41 | 31→38.
export const PERMANENT_ROWS = [
  [range(18, 11), range(21, 28)],
  [range(48, 41), range(31, 38)],
] as const;
export const DECIDUOUS_ROWS = [
  [range(55, 51), range(61, 65)],
  [range(85, 81), range(71, 75)],
] as const;
export const PERMANENT_TEETH = PERMANENT_ROWS.flat(2);
export const DECIDUOUS_TEETH = DECIDUOUS_ROWS.flat(2);
export const isPermanent = (n: number) => PERMANENT_TEETH.includes(n);
export const isValidTooth = (n: number) => Number.isInteger(n) && (PERMANENT_TEETH.includes(n) || DECIDUOUS_TEETH.includes(n));
// Anteriores (incisivos e caninos: segundo dígito 1–3) têm borda incisal; posteriores, face oclusal.
export const isAnterior = (n: number) => n % 10 >= 1 && n % 10 <= 3;

// Situações do dente no odontograma. Canal tratado, coroa e selante ficam registrados (não voltam a "hígido"):
// é informação de prontuário (Res. CFO 174/92).
export const TOOTH_STATUSES = [
  "higido",
  "carie",
  "fratura",
  "tratamento",
  "restaurado",
  "selado",
  "endodontia",
  "coroa",
  "raiz_residual",
  "extracao",
  "incluso",
  "ausente",
  "implante",
] as const;
export type ToothStatus = (typeof TOOTH_STATUSES)[number];
export const isToothStatus = (v: string): v is ToothStatus => (TOOTH_STATUSES as readonly string[]).includes(v);
// O que o dente passa a ter ao concluir um procedimento.
export const TOOTH_RESULTS = ["restaurado", "selado", "endodontia", "coroa", "ausente", "implante"] as const;
export type ToothResult = (typeof TOOTH_RESULTS)[number];
export const isToothResult = (v: string): v is ToothResult => (TOOTH_RESULTS as readonly string[]).includes(v);
export const statusAfter = (result: ToothResult): ToothStatus => result;

// Faces em sigla, na ordem clínica de escrita (MOD, MODVL).
export const FACES = ["M", "O", "I", "D", "V", "L", "P"] as const;
// Normaliza o que vier ("dom", "M,O,D", "vo") para a ordem clínica, sem repetir e só com siglas válidas.
// Anterior não tem oclusal (vira incisal) e posterior não tem incisal (vira oclusal); palatina e lingual ficam como vieram.
export function normalizeFaces(raw: string, tooth?: number | null) {
  const set = new Set(
    raw
      .toUpperCase()
      .replace(/[^MOIDVLPB]/g, "")
      .replace(/B/g, "V")
      .split(""),
  );
  if (tooth && isValidTooth(tooth)) {
    if (isAnterior(tooth) && set.delete("O")) set.add("I");
    if (!isAnterior(tooth) && set.delete("I")) set.add("O");
  }
  return FACES.filter((f) => set.has(f)).join("") || null;
}

export const SPECIALTIES = [
  "prevencao",
  "dentistica",
  "endodontia",
  "periodontia",
  "cirurgia",
  "protese",
  "implantodontia",
  "ortodontia",
  "odontopediatria",
  "estetica",
  "radiologia",
  "outro",
] as const;
export const isSpecialty = (v: string) => (SPECIALTIES as readonly string[]).includes(v);

export const PLAN_STATUSES = ["em_estudo", "aprovado", "recusado", "concluido", "cancelado"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const ITEM_STATUSES = ["planejado", "realizado", "cancelado"] as const;
export const LAB_STATUSES = ["a_enviar", "enviado", "em_prova", "recebido", "instalado", "refazer", "cancelado"] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];
export const LAB_OPEN: LabStatus[] = ["a_enviar", "enviado", "em_prova", "refazer"];
// Próximas etapas possíveis do trabalho de laboratório (a tela oferece e o servidor confere).
export const LAB_NEXT: Record<string, LabStatus[]> = {
  a_enviar: ["enviado", "cancelado"],
  enviado: ["em_prova", "recebido", "cancelado"],
  em_prova: ["enviado", "recebido", "refazer"],
  recebido: ["instalado", "refazer"],
  refazer: ["enviado", "recebido"],
  instalado: [],
  cancelado: [],
};
export const RECALL_REASONS = ["profilaxia", "periodontal", "ortodontia", "revisao", "outro"] as const;
export const RECALL_STATUSES = ["pendente", "agendado", "feito", "cancelado"] as const;
// Transições de retorno: feito e cancelado são finais.
export const RECALL_NEXT: Record<string, string[]> = { pendente: ["agendado", "feito", "cancelado"], agendado: ["feito", "cancelado", "pendente"], feito: [], cancelado: [] };
export const MAX_INSTALLMENTS = 24;

const cents = (v: number) => Math.round(v * 100);

// Totais do plano: o que conta é o que não foi cancelado. Desconto em reais, nunca maior que o bruto.
export function planTotals(items: { price: number; status: string }[], discount = 0) {
  const live = items.filter((i) => i.status !== "cancelado");
  const gross = live.reduce((s, i) => s + cents(i.price), 0);
  const disc = Math.min(Math.max(0, cents(discount)), gross);
  const done = live.filter((i) => i.status === "realizado").reduce((s, i) => s + cents(i.price), 0);
  return {
    gross: gross / 100,
    discount: disc / 100,
    net: (gross - disc) / 100,
    done: done / 100,
    remaining: (gross - done) / 100,
    count: live.length,
    doneCount: live.filter((i) => i.status === "realizado").length,
  };
}

// Parcelas iguais em centavos, com a diferença na primeira (R$ 100 em 3 = 33,34 + 33,33 + 33,33), mês a mês a
// partir do primeiro vencimento (dia âncora mantido: 31/01 → 28/02 → 31/03).
export function splitInstallments(total: number, n: number, firstDueKey: string) {
  const count = Math.min(Math.max(1, Math.floor(n)), MAX_INSTALLMENTS);
  const t = cents(total);
  const base = Math.floor(t / count);
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    amount: (base + (i === 0 ? t - base * count : 0)) / 100,
    dueKey: addMonthsKey(firstDueKey, i),
  }));
}

// O plano termina quando não sobra item planejado (e houve ao menos um realizado).
export const planShouldConclude = (items: { status: string }[]) =>
  items.some((i) => i.status === "realizado") && !items.some((i) => i.status === "planejado");

// Laboratório: atrasado se ainda aberto e o prazo já passou (comparação por data em São Paulo, chaves AAAA-MM-DD).
export const labOverdue = (o: { status: string; dueKey: string | null }, todayKey: string) =>
  !!o.dueKey && (LAB_OPEN as string[]).includes(o.status) && o.dueKey < todayKey;

// Motivo do retorno sugerido pela especialidade do procedimento.
export const recallReasonFor = (specialty: string) =>
  specialty === "periodontia" ? "periodontal" : specialty === "ortodontia" ? "ortodontia" : specialty === "prevencao" ? "profilaxia" : "revisao";

// Tabela sugerida: nomes comuns na clínica, sem preço nem código (o consultório preenche com a tabela dele e o TUSS
// da operadora). perTooth: exige dente; toothResult: o que muda no odontograma ao concluir.
export const SUGGESTED_PROCEDURES: { key: string; specialty: (typeof SPECIALTIES)[number]; perTooth: boolean; toothResult?: ToothResult; returnMonths?: number }[] = [
  { key: "consulta", specialty: "prevencao", perTooth: false },
  { key: "profilaxia", specialty: "prevencao", perTooth: false, returnMonths: 6 },
  { key: "fluor", specialty: "prevencao", perTooth: false },
  { key: "selante", specialty: "prevencao", perTooth: true, toothResult: "selado" },
  { key: "radiografiaPeriapical", specialty: "radiologia", perTooth: true },
  { key: "radiografiaPanoramica", specialty: "radiologia", perTooth: false },
  { key: "resina1", specialty: "dentistica", perTooth: true, toothResult: "restaurado" },
  { key: "resina2", specialty: "dentistica", perTooth: true, toothResult: "restaurado" },
  { key: "resina3", specialty: "dentistica", perTooth: true, toothResult: "restaurado" },
  { key: "endoUni", specialty: "endodontia", perTooth: true, toothResult: "endodontia" },
  { key: "endoBi", specialty: "endodontia", perTooth: true, toothResult: "endodontia" },
  { key: "endoMulti", specialty: "endodontia", perTooth: true, toothResult: "endodontia" },
  { key: "raspagem", specialty: "periodontia", perTooth: false, returnMonths: 3 },
  { key: "manutencaoPerio", specialty: "periodontia", perTooth: false, returnMonths: 3 },
  { key: "exodontia", specialty: "cirurgia", perTooth: true, toothResult: "ausente" },
  { key: "exodontiaSiso", specialty: "cirurgia", perTooth: true, toothResult: "ausente" },
  { key: "coroa", specialty: "protese", perTooth: true, toothResult: "coroa" },
  { key: "nucleo", specialty: "protese", perTooth: true },
  { key: "provisorio", specialty: "protese", perTooth: true },
  { key: "ppr", specialty: "protese", perTooth: false },
  { key: "proteseTotal", specialty: "protese", perTooth: false },
  { key: "implante", specialty: "implantodontia", perTooth: true, toothResult: "implante" },
  { key: "coroaImplante", specialty: "implantodontia", perTooth: true, toothResult: "implante" },
  { key: "aparelhoFixo", specialty: "ortodontia", perTooth: false },
  { key: "manutencaoOrto", specialty: "ortodontia", perTooth: false, returnMonths: 1 },
  { key: "clareamento", specialty: "estetica", perTooth: false },
  { key: "placa", specialty: "outro", perTooth: false },
  { key: "urgencia", specialty: "outro", perTooth: false },
  { key: "remocaoSutura", specialty: "cirurgia", perTooth: false },
  { key: "ionomero", specialty: "dentistica", perTooth: true, toothResult: "restaurado" },
  { key: "faceta", specialty: "estetica", perTooth: true, toothResult: "coroa" },
  { key: "inlay", specialty: "protese", perTooth: true, toothResult: "restaurado" },
  { key: "raspagemSub", specialty: "periodontia", perTooth: false, returnMonths: 3 },
  { key: "gengivectomia", specialty: "periodontia", perTooth: true },
  { key: "pulpotomia", specialty: "odontopediatria", perTooth: true, toothResult: "endodontia" },
  { key: "exodontiaDeciduo", specialty: "odontopediatria", perTooth: true, toothResult: "ausente" },
  { key: "mantenedor", specialty: "odontopediatria", perTooth: false },
];
