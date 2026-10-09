// Permissões e utilidades das telas de estoque (só existem quando a área tem o módulo ligado).
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/modules";
import type { Formatters } from "@/i18n/format";

export const UNITS = ["U", "mL", "seringa", "frasco", "un", "g"] as const;
export const PRODUCT_KINDS = ["insumo", "revenda"] as const;
export const LOSS_REASONS = ["vencido", "sobra_frasco", "quebra", "outro"] as const;

// Dono, admin e profissional gerenciam; financeiro consulta (custos, lotes, histórico); recepção vê só a lista.
type Who = { role: string; permissions?: Set<string> };
export const canManageStock = (who: Who) => !!who.permissions?.has("estoque.gerenciar");
export const canViewStockDetail = (who: Who) => canManageStock(who) || who.role === "financial";

export async function requireStock(level: "list" | "view" | "manage" = "list") {
  const ctx = await requireModule("estoque");
  if (level === "view" && !canViewStockDetail(ctx)) notFound();
  if (level === "manage" && !canManageStock(ctx)) notFound();
  return ctx;
}

type UnitT = { (key: string): string; has: (key: string) => boolean };

// Unidade no singular ou plural pela regra do idioma (pt: 0,5 e 1 são singular; en: só 1).
export const unitLabel = (f: Formatters, tu: UnitT, unit: string, quantity: number) => {
  const key = `${unit}.${new Intl.PluralRules(f.locale).select(quantity) === "one" ? "one" : "other"}`;
  return tu.has(key) ? tu(key) : unit;
};

// "0,5 mL", "3 seringas": número no formato do idioma e unidade no plural certo.
export const formatQty = (f: Formatters, tu: UnitT, quantity: number, unit: string) =>
  `${f.number(quantity)} ${unitLabel(f, tu, unit, quantity)}`;
