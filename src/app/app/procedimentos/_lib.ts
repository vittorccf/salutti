// Só no servidor: contexto das telas de procedimentos (módulo ligado na área do consultório).
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { moduleEnabled } from "@/lib/areas";
import { canSeeClinical } from "@/lib/permissions";
import { db } from "@/lib/db";

export async function requireProceduresContext({ clinical = false } = {}) {
  const ctx = await requireContext();
  if (!moduleEnabled(ctx.workspace.area, "procedimentos")) notFound();
  if (clinical && !canSeeClinical(ctx.role)) notFound();
  return ctx;
}

// Produtos do estoque que podem entrar no kit (insumos e revenda ativos).
export const kitProducts = (workspaceId: string) =>
  db.product.findMany({ where: { workspaceId, active: true }, select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } });

// Sugestões do estado vazio: começam o cadastro já preenchido.
export const PRESETS = {
  toxin: { category: "injetavel", durationMinutes: 30, returnDays: 120 },
  cleansing: { category: "facial", durationMinutes: 60, returnDays: null },
  lipFiller: { category: "injetavel", durationMinutes: 60, returnDays: null },
} as const;
export type PresetKey = keyof typeof PRESETS;
export const isPresetKey = (v: unknown): v is PresetKey => typeof v === "string" && v in PRESETS;
