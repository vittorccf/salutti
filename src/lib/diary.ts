// Cartão diário: regras puras (sem banco). Referências: Daylio (humor + atividades + "pixels"), How We Feel (emoções
// nomeadas por energia × agradabilidade), Bearable (correlação não é causa), diary card da DBT, EMA (adesão cai com
// muitos itens: poucos itens, todos opcionais menos o humor). Instrumentos de uso livre: PHQ-9 e GAD-7 (Spitzer,
// Kroenke, Williams) e WHO-5 (OMS). Não é ferramenta de diagnóstico nem de monitoramento em tempo real.

export const DIARY_ITEMS = ["anxiety", "sleep", "energy", "medication", "emotions", "activities", "notes"] as const;
export type DiaryItem = (typeof DIARY_ITEMS)[number];

// Emoções em 4 quadrantes (energia alta/baixa × agradável/desagradável). Culpa, vergonha, raiva e vazio entram por serem
// centrais em depressão e na DBT.
export const EMOTIONS = {
  alta_desagradavel: ["ansioso", "irritado", "raiva", "estressado", "com_medo"],
  baixa_desagradavel: ["triste", "cansado", "sozinho", "desanimado", "vazio", "culpa", "vergonha"],
  alta_agradavel: ["animado", "alegre", "orgulhoso", "esperancoso"],
  baixa_agradavel: ["calmo", "grato", "aliviado", "seguro"],
} as const;
export const EMOTION_KEYS: string[] = Object.values(EMOTIONS).flat();
export const MAX_EMOTIONS = 3;

export const ACTIVITIES = ["exercicio", "ar_livre", "amigos_familia", "trabalho_estudo", "lazer", "tarefa_terapia", "meditacao", "boa_alimentacao", "alcool", "telas"] as const;

export const QUESTION_TYPES = ["scale", "yesno", "number", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
// archived: pergunta removida ou alterada; some do check-in, mas as respostas antigas continuam no relatório e no CSV.
export type DiaryQuestion = { id: string; label: string; type: QuestionType; archived?: boolean };
export const MAX_QUESTIONS = 5;
export const QUESTION_LABEL_MAX = 80;

export const INSTRUMENT_INTERVALS = [7, 14, 28] as const;

type Band = { max: number; key: string };
type Instrument = { items: number; min: number; max: number; bands: Band[]; multiplier: number; riskItem?: number };

// Faixas: PHQ-9 0-4/5-9/10-14/15-19/20-27; GAD-7 0-4/5-9/10-14/15-21; WHO-5 0-100 (≤28 provável depressão, ≤50 investigar).
export const INSTRUMENTS: Record<"phq9" | "gad7" | "who5", Instrument> = {
  phq9: {
    items: 9,
    min: 0,
    max: 3,
    multiplier: 1,
    riskItem: 8,
    bands: [
      { max: 4, key: "minimo" },
      { max: 9, key: "leve" },
      { max: 14, key: "moderado" },
      { max: 19, key: "moderadamente_grave" },
      { max: 27, key: "grave" },
    ],
  },
  gad7: {
    items: 7,
    min: 0,
    max: 3,
    multiplier: 1,
    bands: [
      { max: 4, key: "minimo" },
      { max: 9, key: "leve" },
      { max: 14, key: "moderado" },
      { max: 21, key: "grave" },
    ],
  },
  who5: {
    items: 5,
    min: 0,
    max: 5,
    multiplier: 4,
    bands: [
      { max: 28, key: "muito_baixo" },
      { max: 50, key: "baixo" },
      { max: 100, key: "adequado" },
    ],
  },
};
export type InstrumentId = keyof typeof INSTRUMENTS;
export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];
export const isInstrument = (v: string): v is InstrumentId => Object.hasOwn(INSTRUMENTS, v);
// Escore máximo de cada um (para o gráfico e o texto "x de y").
export const instrumentMax = (id: InstrumentId) => INSTRUMENTS[id].items * INSTRUMENTS[id].max * INSTRUMENTS[id].multiplier;

// Modelos prontos: ponto de partida que o profissional ajusta.
export const TEMPLATES: Record<string, { items: DiaryItem[]; instruments: InstrumentId[] }> = {
  basico: { items: ["anxiety", "sleep", "notes"], instruments: [] },
  ansiedade: { items: ["anxiety", "sleep", "emotions", "activities", "notes"], instruments: ["gad7"] },
  humor: { items: ["sleep", "energy", "emotions", "activities", "notes"], instruments: ["phq9"] },
  bem_estar: { items: ["sleep", "activities", "notes"], instruments: ["who5"] },
};
export const TEMPLATE_KEYS = Object.keys(TEMPLATES);

export type DiarySetup = {
  template: string;
  items: DiaryItem[];
  // Perguntas ativas (no check-in) e todas (relatório e CSV, inclusive as arquivadas).
  questions: DiaryQuestion[];
  allQuestions: DiaryQuestion[];
  instruments: InstrumentId[];
  instrumentEveryDays: number;
  patientConsentAt: Date | null;
  riskProtocolAckAt: Date | null;
};

// Configuração efetiva: sem linha no banco, vale o modelo básico (o cartão de sempre).
export function diarySetup(
  row: { template: string; items: string[]; questions: unknown; instruments: string[]; instrumentEveryDays: number; patientConsentAt: Date | null; riskProtocolAckAt?: Date | null } | null,
): DiarySetup {
  if (!row) return { template: "basico", items: [...TEMPLATES.basico.items], questions: [], allQuestions: [], instruments: [], instrumentEveryDays: 14, patientConsentAt: null, riskProtocolAckAt: null };
  const all = parseQuestions(row.questions);
  return {
    template: row.template,
    items: [...new Set(row.items)].filter((i): i is DiaryItem => (DIARY_ITEMS as readonly string[]).includes(i)),
    questions: all.filter((q) => !q.archived).slice(0, MAX_QUESTIONS),
    allQuestions: all,
    instruments: [...new Set(row.instruments)].filter(isInstrument),
    instrumentEveryDays: row.instrumentEveryDays,
    patientConsentAt: row.patientConsentAt,
    riskProtocolAckAt: row.riskProtocolAckAt ?? null,
  };
}

export function parseQuestions(raw: unknown): DiaryQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((q): q is DiaryQuestion => !!q && typeof q === "object" && typeof q.id === "string" && typeof q.label === "string" && (QUESTION_TYPES as readonly string[]).includes(q.type))
    .filter((q) => !seen.has(q.id) && !!seen.add(q.id))
    .map((q) => ({ id: q.id, label: q.label, type: q.type, ...(q.archived ? { archived: true } : {}) }));
}

// Resposta a uma pergunta própria, validada pelo tipo (vazio = não respondeu).
export function parseAnswer(type: QuestionType, raw: string): number | boolean | string | null {
  const v = raw.trim();
  if (!v) return null;
  if (type === "scale") {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
  }
  if (type === "yesno") return v === "sim" ? true : v === "nao" ? false : null;
  if (type === "number") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && Math.abs(n) <= 100_000 ? n : null;
  }
  return v.slice(0, 280);
}

export function scoreInstrument(id: InstrumentId, answers: number[]) {
  const def = INSTRUMENTS[id];
  if (answers.length !== def.items || answers.some((a) => !Number.isInteger(a) || a < def.min || a > def.max)) return null;
  const score = answers.reduce((a, b) => a + b, 0) * def.multiplier;
  const band = def.bands.find((b) => score <= b.max)!.key;
  const risk = def.riskItem !== undefined && answers[def.riskItem] > 0;
  return { score, band, risk };
}

// Questionário vence a cada N dias desde a última resposta (nunca respondido = já vence).
export const instrumentDue = (last: Date | null, everyDays: number, now = new Date()) => !last || now.getTime() - last.getTime() >= everyDays * 86_400_000 - 3_600_000;

// Média móvel (janela de 7 dias por padrão) ignorando dias sem registro; null quando a janela está vazia.
export function movingAverage(values: (number | null)[], window = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v !== null);
    return slice.length ? Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10 : null;
  });
}

// Correlação de Pearson; null com menos de 14 pares (com menos, qualquer "tendência" engana) ou sem variação.
export const MIN_PAIRS = 14;
export function pearson(pairs: [number, number][]) {
  if (pairs.length < MIN_PAIRS) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  if (!dx || !dy) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

// Leitura em palavras (associação, não causa).
export function associationStrength(r: number | null): "none" | "weak" | "moderate" | "strong" | null {
  if (r === null) return null;
  const a = Math.abs(r);
  return a < 0.1 ? "none" : a < 0.3 ? "weak" : a < 0.5 ? "moderate" : "strong";
}

// Humor médio nos dias com e sem um marcador (atividade ou emoção), só com pelo menos 5 dias de cada lado.
export const MIN_DAYS_EACH = 5;
export function moodWithAndWithout(cards: { mood: number; tags: string[] }[], tag: string) {
  const withTag = cards.filter((c) => c.tags.includes(tag));
  const without = cards.filter((c) => !c.tags.includes(tag));
  if (withTag.length < MIN_DAYS_EACH || without.length < MIN_DAYS_EACH) return null;
  const avg = (xs: { mood: number }[]) => Math.round((xs.reduce((s, c) => s + c.mood, 0) / xs.length) * 10) / 10;
  return { with: avg(withTag), without: avg(without), days: withTag.length };
}

// Frequência dos marcadores, do mais comum ao menos.
export function tagCounts(lists: string[][]) {
  const counts = new Map<string, number>();
  for (const list of lists) for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// CSV com ";" (Excel em pt-BR) e aspas quando preciso. Texto que começa com = + - @ ganha apóstrofo (fórmula no Excel).
export const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Salva as perguntas do formulário: mantém o id só se rótulo e tipo não mudaram (senão as respostas antigas ficariam
// sob outro sentido); as que saíram ou mudaram ficam arquivadas, com as respostas guardadas.
export function mergeQuestions(current: DiaryQuestion[], submitted: { prevId: string; label: string; type: QuestionType }[], newId: () => string): DiaryQuestion[] {
  const used = new Set<string>();
  const active: DiaryQuestion[] = [];
  for (const s of submitted.slice(0, MAX_QUESTIONS)) {
    const prev = current.find((q) => q.id === s.prevId && !q.archived);
    const keep = prev && !used.has(prev.id) && prev.label === s.label && prev.type === s.type;
    const id = keep ? prev.id : newId();
    used.add(id);
    active.push({ id, label: s.label, type: s.type });
  }
  const archived = current.filter((q) => !used.has(q.id)).map((q) => ({ ...q, archived: true as const }));
  return [...active, ...archived];
}
