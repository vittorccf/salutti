// Rótulos e cores do backoffice (ferramenta interna, só em pt-BR).
import type { BadgeProps } from "@/components/ui/badge";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/support";
import { formatBRL } from "@/lib/utils";

type Variant = NonNullable<BadgeProps["variant"]>;

const pick = <T extends Record<string, string>>(map: T, key: string | null | undefined) =>
  (key && key in map ? map[key as keyof T] : key) ?? "—";

export const ticketStatusLabel = (s: string) => pick(TICKET_STATUSES, s);
export const ticketCategoryLabel = (c: string) => pick(TICKET_CATEGORIES, c);
export const ticketPriorityLabel = (p: string) => pick(TICKET_PRIORITIES, p);

export const ticketStatusVariant = (s: string): Variant =>
  ({ aberto: "warning", em_andamento: "default", aguardando_cliente: "muted", resolvido: "success", fechado: "secondary" })[s] as Variant ?? "muted";

export const ticketPriorityVariant = (p: string): Variant =>
  ({ urgente: "destructive", alta: "warning", normal: "muted", baixa: "secondary" })[p] as Variant ?? "muted";

export const BACKOFFICE_ROLES = { admin: "Administrador", suporte: "Suporte", financeiro: "Financeiro", comercial: "Comercial" } as const;
export const backofficeRoleLabel = (r: string) => pick(BACKOFFICE_ROLES, r);

export const MEMBER_ROLES = {
  owner: "Dono",
  admin: "Administrador",
  professional: "Profissional",
  financial: "Financeiro",
  receptionist: "Recepção",
} as const;
export const memberRoleLabel = (r: string) => pick(MEMBER_ROLES, r);

export const AREA_LABELS = { mental: "Salutti", estetica: "Salutti Estética", odonto: "Salutti Odonto" } as const;
export const areaLabel = (a: string) => pick(AREA_LABELS, a);
export const accountTypeLabel = (t: string) => pick({ autonomo: "Autônomo", clinica: "Clínica" }, t);

// Planos antigos (antes do catálogo PlatformPlan) continuam legíveis.
const LEGACY_PLANS = { starter: "Starter (legado)", pro: "Pro (legado)", enterprise: "Clínica (legado)" } as const;
export const planLabel = (code: string, plans: { code: string; name: string }[]) =>
  plans.find((p) => p.code === code)?.name ?? pick(LEGACY_PLANS, code);

export const INTERVALS = { trial: "Teste", mensal: "Mensal", anual: "Anual" } as const;
export const intervalLabel = (i: string) => pick(INTERVALS, i);

export const formatPlanPrice = (plan: { priceCents: number; interval: string; trialDays: number | null }) => {
  if (plan.interval === "trial") return plan.trialDays ? `Grátis por ${plan.trialDays} dias` : "Grátis";
  return `${formatBRL(plan.priceCents / 100)}/${plan.interval === "anual" ? "ano" : "mês"}`;
};
