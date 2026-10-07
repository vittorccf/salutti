// Procedimentos da Salutti Estética: regras puras (sem banco) usadas pelo catálogo, pela sessão e pela ficha.
import { addDays } from "date-fns";
import { inSP, toDateTimeLocalSP } from "./dates";

export const PROCEDURE_CATEGORIES = ["facial", "injetavel", "corporal", "capilar", "outro"] as const;
export type ProcedureCategory = (typeof PROCEDURE_CATEGORIES)[number];
export const isProcedureCategory = (v: unknown): v is ProcedureCategory =>
  typeof v === "string" && (PROCEDURE_CATEGORIES as readonly string[]).includes(v);

// Intervalos de retorno típicos (docs/ESTETICA.md): sugestões no cadastro, a profissional decide.
export const RETURN_SUGGESTIONS = [
  { key: "toxin", days: 120 },
  { key: "touchUp", days: 15 },
  { key: "biostimulator", days: 45 },
  { key: "skinbooster", days: 21 },
] as const;

export const PHOTO_STAGES = ["antes", "durante", "depois"] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];
export const isPhotoStage = (v: unknown): v is PhotoStage => typeof v === "string" && (PHOTO_STAGES as readonly string[]).includes(v);

// Quantidade digitada no formato brasileiro ou internacional: "1,5", "1.5", "50", "1.000,5".
// Vazio = null (linha ignorada); inválido ou negativo = NaN.
export function parseQuantity(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  let normalized = s;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 1000) / 1000;
}

// Quantidade para exibir num campo editável (vírgula decimal no pt-BR, sem zeros à direita).
export const quantityInput = (n: number, locale = "pt-BR") =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false }).format(n);

type UseLine = { quantity: number; lotUnitCost: number | null; productUnitCost: number | null };

// Custo de insumos de uma sessão: soma de cada saída (quantidade negativa) pelo custo do lote usado
// (ou, sem custo no lote, pelo custo cadastrado no produto). Sem custo conhecido, conta zero.
export function suppliesCost(lines: UseLine[]) {
  const total = lines.reduce((s, l) => s + Math.abs(l.quantity) * (l.lotUnitCost ?? l.productUnitCost ?? 0), 0);
  return Math.round(total * 100) / 100;
}

// Margem do atendimento: valor da sessão menos o custo dos insumos; percentual sobre o valor (null se valor 0).
export function sessionMargin(price: number, cost: number) {
  const value = Math.round((price - cost) * 100) / 100;
  return { value, percent: price > 0 ? (value / price) * 100 : null };
}

// Retorno sugerido: mesmo horário da sessão, returnDays dias depois (no calendário de São Paulo).
export function returnDate(startsAt: Date, returnDays: number) {
  return new Date(addDays(inSP(startsAt), returnDays).getTime());
}

// Valor para <input type="datetime-local"> do retorno (prefill de /app/agenda/novo).
export const returnStartsAtLocal = (startsAt: Date, returnDays: number) => toDateTimeLocalSP(returnDate(startsAt, returnDays));

export const isDateTimeLocal = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);

// Galeria antes x depois: agrupa por procedimento (null = sem procedimento) e, em cada grupo, por etapa,
// do mais antigo para o mais recente. Grupos na ordem da foto mais recente.
export function groupPhotos<T extends { procedureId: string | null; stage: string; takenAt: Date }>(photos: T[]) {
  const groups = new Map<string | null, Record<PhotoStage, T[]>>();
  const sorted = [...photos].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  for (const p of sorted) {
    const g = groups.get(p.procedureId) ?? { antes: [], durante: [], depois: [] };
    g[isPhotoStage(p.stage) ? p.stage : "antes"].push(p);
    groups.set(p.procedureId, g);
  }
  const latest = (g: Record<PhotoStage, T[]>) => Math.max(...PHOTO_STAGES.flatMap((s) => g[s].map((p) => p.takenAt.getTime())));
  return [...groups.entries()]
    .map(([procedureId, stages]) => ({ procedureId, stages }))
    .sort((a, b) => latest(b.stages) - latest(a.stages));
}
