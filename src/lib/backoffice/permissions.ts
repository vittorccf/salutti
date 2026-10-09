// Permissões da equipe do backoffice. O catálogo fica no código (fonte da verdade); o banco guarda só o papel-base
// e os ajustes por pessoa (concedidas e negadas). Efetivas = (papel ∪ concedidas) − negadas.
//
// Regras contra escalonamento (aplicadas na tela de equipe): ninguém concede o que não tem, ninguém mexe nas
// próprias permissões e sempre fica ao menos uma pessoa ativa com "equipe.gerenciar".

export const BO_PERMISSIONS = {
  "chamados.ver": { group: "Chamados", label: "Ver chamados" },
  "chamados.responder": { group: "Chamados", label: "Responder, atribuir e fechar chamados" },
  "clientes.ver": { group: "Clientes", label: "Ver clientes e usuários dos consultórios" },
  "clientes.editar": { group: "Clientes", label: "Mudar plano, teste e situação do cliente" },
  "clientes.liberacoes": { group: "Clientes", label: "Liberar ou bloquear módulos e limites do cliente" },
  "clientes.acesso_suporte": { group: "Clientes", label: "Entrar na conta do cliente (acesso de suporte)" },
  "planos.ver": { group: "Planos", label: "Ver o catálogo de planos" },
  "planos.editar": { group: "Planos", label: "Editar planos e sincronizar com o Stripe" },
  "equipe.gerenciar": { group: "Administração", label: "Cadastrar a equipe e dar permissões" },
  "recursos.ver": { group: "Administração", label: "Ver a gestão de recursos (Vercel e banco)" },
  "auditoria.ver": { group: "Administração", label: "Ver a auditoria" },
} as const;

export type BoPermission = keyof typeof BO_PERMISSIONS;
export const ALL_BO_PERMISSIONS = Object.keys(BO_PERMISSIONS) as BoPermission[];
export const isBoPermission = (v: string): v is BoPermission => Object.hasOwn(BO_PERMISSIONS, v);

export const BO_ROLES = ["admin", "suporte", "financeiro", "comercial"] as const;
export type BoRole = (typeof BO_ROLES)[number];

// Papéis prontos: ponto de partida, ajustável por pessoa.
export const BO_ROLE_DEFAULTS: Record<BoRole, BoPermission[]> = {
  admin: ALL_BO_PERMISSIONS,
  suporte: ["chamados.ver", "chamados.responder", "clientes.ver", "planos.ver"],
  financeiro: ["clientes.ver", "clientes.editar", "planos.ver", "planos.editar", "recursos.ver"],
  comercial: ["clientes.ver", "clientes.liberacoes", "planos.ver"],
};

export const BO_ROLE_LABELS: Record<BoRole, string> = {
  admin: "Administrador",
  suporte: "Suporte",
  financeiro: "Financeiro",
  comercial: "Comercial",
};

type BoUserPerms = { role: string; permsGranted: string[]; permsDenied: string[] };

export function effectiveBoPermissions(user: BoUserPerms): Set<BoPermission> {
  const base = BO_ROLE_DEFAULTS[user.role as BoRole] ?? [];
  const set = new Set<BoPermission>([...base, ...user.permsGranted.filter(isBoPermission)]);
  for (const p of user.permsDenied) if (isBoPermission(p)) set.delete(p);
  return set;
}

export const boCan = (user: BoUserPerms, perm: BoPermission) => effectiveBoPermissions(user).has(perm);

// Ajustes a gravar para chegar às permissões desejadas a partir do papel: só o que difere do papel.
export function diffFromRole(role: BoRole, desired: Set<BoPermission>) {
  const base = new Set(BO_ROLE_DEFAULTS[role]);
  return {
    permsGranted: ALL_BO_PERMISSIONS.filter((p) => desired.has(p) && !base.has(p)),
    permsDenied: ALL_BO_PERMISSIONS.filter((p) => !desired.has(p) && base.has(p)),
  };
}

export type GrantProblem = "self" | "escalation" | null;

// Quem edita só concede o que tem e não edita a si mesmo. Retirar o que não tem também não pode
// (senão alguém com menos poder desligaria permissões de quem tem mais).
export function grantProblem(actor: BoUserPerms & { id: string }, targetId: string, before: Set<BoPermission>, after: Set<BoPermission>): GrantProblem {
  if (actor.id === targetId) return "self";
  const mine = effectiveBoPermissions(actor);
  for (const p of ALL_BO_PERMISSIONS) {
    if (before.has(p) !== after.has(p) && !mine.has(p)) return "escalation";
  }
  return null;
}
