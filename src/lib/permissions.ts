// Guardas de permissão do app (só no servidor). Regras e catálogo em src/lib/app-permissions.ts.
// Quem vê conteúdo clínico (prontuário, evoluções, anamnese, humor diário): só papéis clínicos com "clinico.ver".
// Recepção e financeiro trabalham com agenda, cadastro e cobrança, mas não leem o prontuário: sigilo (Código de Ética
// do Psicólogo, art. 9º) e necessidade (LGPD, art. 6º, III).
import { notFound } from "next/navigation";
import { requireContext } from "./auth";
import { moduleEnabled } from "./areas";
import { CLINICAL_ROLES, isClinicalRole, type AppPermission } from "./app-permissions";

export { CLINICAL_ROLES };

type PermCtx = { role: string; permissions?: Set<AppPermission> };

// Aceita o papel (regra padrão) ou o contexto (com os ajustes do membro).
export const can = (who: string | PermCtx, perm: AppPermission) => {
  if (typeof who === "string") return perm === "clinico.ver" ? isClinicalRole(who) : false;
  return who.permissions ? who.permissions.has(perm) : false;
};

export const canSeeClinical = (who: string | PermCtx) =>
  typeof who === "string" ? isClinicalRole(who) : isClinicalRole(who.role) && can(who, "clinico.ver");

// Contas a pagar mostram o custo do consultório (aluguel, salários, impostos): por padrão dono, administrador e financeiro.
export const FINANCE_ADMIN_ROLES = ["owner", "admin", "financial"] as const;
export const canManagePayables = (who: string | PermCtx) =>
  typeof who === "string" ? (FINANCE_ADMIN_ROLES as readonly string[]).includes(who) : can(who, "financeiro.pagar");

// Para páginas e actions: sem permissão, responde como se a página não existisse.
export async function requirePermission(perm: AppPermission, opts?: Parameters<typeof requireContext>[0]) {
  const ctx = await requireContext(opts);
  if (!can(ctx, perm)) notFound();
  return ctx;
}

export async function requireClinicalContext() {
  const ctx = await requireContext();
  if (!canSeeClinical(ctx)) notFound();
  return ctx;
}

// Portal do paciente (lado do profissional): conteúdo clínico e módulo liberado para o cliente.
export async function requirePortalModule() {
  const ctx = await requireClinicalContext();
  if (!moduleEnabled(ctx.workspace, "portal")) notFound();
  return ctx;
}
