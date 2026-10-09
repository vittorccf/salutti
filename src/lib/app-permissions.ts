// Permissões dos membros dentro do consultório (regras puras, sem banco). O catálogo fica no código; o banco guarda
// só o papel e os ajustes do dono/administrador (Membership.permsGranted / permsDenied).
//
// Efetivas = (padrão do papel ∪ concedidas − negadas), com uma regra fixa: conteúdo clínico (prontuário, portal,
// cartão diário) só para papéis clínicos. Recepção e financeiro nunca leem prontuário, mesmo com ajuste
// (sigilo: Código de Ética do Psicólogo, art. 9º; necessidade: LGPD, art. 6º, III).

export const APP_PERMISSIONS = [
  "agenda.gerenciar",
  "pacientes.gerenciar",
  "clinico.ver",
  "financeiro.receber",
  "financeiro.pagar",
  "fiscal.ver",
  "estoque.gerenciar",
  "equipe.gerenciar",
  "lgpd.gerenciar",
] as const;
export type AppPermission = (typeof APP_PERMISSIONS)[number];
export const isAppPermission = (v: string): v is AppPermission => (APP_PERMISSIONS as readonly string[]).includes(v);

export const CLINICAL_ROLES = ["owner", "admin", "professional"] as const;
export const isClinicalRole = (role: string) => (CLINICAL_ROLES as readonly string[]).includes(role);

// Padrão de cada papel: o mesmo acesso que o app já dava antes das permissões personalizáveis.
export const APP_ROLE_DEFAULTS: Record<string, AppPermission[]> = {
  owner: [...APP_PERMISSIONS],
  admin: [...APP_PERMISSIONS],
  professional: ["agenda.gerenciar", "pacientes.gerenciar", "clinico.ver", "financeiro.receber", "fiscal.ver", "estoque.gerenciar"],
  financial: ["agenda.gerenciar", "pacientes.gerenciar", "financeiro.receber", "financeiro.pagar", "fiscal.ver"],
  receptionist: ["agenda.gerenciar", "pacientes.gerenciar", "financeiro.receber", "fiscal.ver"],
};

// Permissão que o papel não pode receber nem por ajuste (regra fixa do sigilo clínico).
export const lockedFor = (role: string, perm: AppPermission) => perm === "clinico.ver" && !isClinicalRole(role);

export function effectiveAppPermissions(role: string, granted: string[] = [], denied: string[] = []): Set<AppPermission> {
  // Dono: sempre tudo (não dá para tirar acesso de quem responde pelo consultório).
  if (role === "owner") return new Set(APP_PERMISSIONS);
  const set = new Set<AppPermission>([...(APP_ROLE_DEFAULTS[role] ?? []), ...granted.filter(isAppPermission)]);
  for (const p of denied) if (isAppPermission(p)) set.delete(p);
  for (const p of [...set]) if (lockedFor(role, p)) set.delete(p);
  return set;
}

// Ajustes a gravar para chegar às permissões desejadas a partir do papel (só o que difere do padrão).
export function appDiffFromRole(role: string, desired: Set<AppPermission>) {
  const base = new Set(APP_ROLE_DEFAULTS[role] ?? []);
  return {
    permsGranted: APP_PERMISSIONS.filter((p) => desired.has(p) && !base.has(p) && !lockedFor(role, p)),
    permsDenied: APP_PERMISSIONS.filter((p) => !desired.has(p) && base.has(p)),
  };
}

// Quem edita (dono ou administrador) só concede ou retira o que tem; não edita a si mesmo, o dono nem,
// sendo administrador, outro administrador.
export function appGrantProblem(
  actor: { role: string; userId: string; perms: Set<AppPermission> },
  target: { role: string; userId: string },
  before: Set<AppPermission>,
  after: Set<AppPermission>,
): "self" | "owner" | "peer" | "escalation" | null {
  if (actor.userId === target.userId) return "self";
  if (target.role === "owner") return "owner";
  if (target.role === "admin" && actor.role !== "owner") return "peer";
  for (const p of APP_PERMISSIONS) if (before.has(p) !== after.has(p) && !actor.perms.has(p)) return "escalation";
  return null;
}
