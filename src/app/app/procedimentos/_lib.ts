// Só no servidor: contexto das telas de procedimentos (módulo ligado na área do consultório).
import { requireModule } from "@/lib/modules";
import { db } from "@/lib/db";
import { RETURN_SUGGESTIONS } from "@/lib/procedures";

export const requireProceduresContext = ({ clinical = false } = {}) => requireModule("procedimentos", { clinical });

// Produtos do estoque que podem entrar no kit (insumos e revenda ativos).
export const kitProducts = (workspaceId: string) =>
  db.product.findMany({ where: { workspaceId, active: true }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } });

// Sugestões do estado vazio: começam o cadastro já preenchido.
export const PRESETS = {
  toxin: { category: "injetavel", durationMinutes: 30, returnDays: RETURN_SUGGESTIONS[0].days },
  cleansing: { category: "facial", durationMinutes: 60, returnDays: null },
  lipFiller: { category: "injetavel", durationMinutes: 60, returnDays: null },
} as const;
export type PresetKey = keyof typeof PRESETS;
export const isPresetKey = (v: unknown): v is PresetKey => typeof v === "string" && v in PRESETS;
