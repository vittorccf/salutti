// Só no servidor: guarda das rotas e ações de módulos que dependem da área (convênios, estoque, procedimentos).
// Módulo desligado na área do consultório = a rota não existe (404), mesmo digitando a URL.
import { notFound } from "next/navigation";
import { requireContext } from "./auth";
import { moduleEnabled, type Module } from "./areas";
import { canSeeClinical } from "./permissions";

export async function requireModule(module: Module, { clinical = false } = {}) {
  const ctx = await requireContext();
  if (!moduleEnabled(ctx.workspace.area, module)) notFound();
  if (clinical && !canSeeClinical(ctx.role)) notFound();
  return ctx;
}
