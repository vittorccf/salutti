import { AREAS, areaOfSegment, type Area } from "./areas";

// Tipo de conta: profissional autônomo (um profissional, o próprio dono) ou clínica (equipe, recepção, CNPJ).
// A escolha acontece no cadastro e pode ser trocada em Ajustes.
export type AccountType = "autonomo" | "clinica";

export const ACCOUNT_TYPES: Record<AccountType, { label: string; description: string }> = {
  autonomo: {
    label: "Profissional autônomo",
    description: "Você atende sozinho, no consultório ou online. Um profissional na conta.",
  },
  clinica: {
    label: "Clínica",
    description: "Equipe com vários profissionais, recepção e dados da empresa (CNPJ).",
  },
};

export const isAccountType = (v: unknown): v is AccountType => v === "autonomo" || v === "clinica";
export const accountTypeLabel = (v: string) => (isAccountType(v) ? ACCOUNT_TYPES[v].label : v);

// Segmento válido para o tipo de conta dentro da área (Salutti ou Salutti Estética).
export const segmentAllowed = (type: AccountType, segment: string, area: Area = "mental") =>
  AREAS[area].segments[type].includes(segment);

// Na troca de tipo, a área de atendimento acompanha: "clínica multiprofissional" vira "psicologia" e vice-versa.
export function segmentAfterMigration(to: AccountType, segment: string) {
  const area = areaOfSegment(segment);
  if (segmentAllowed(to, segment, area)) return segment;
  // Sem correspondência direta: o primeiro segmento do novo tipo na mesma área (psicanalista continua psicanalista).
  if (area === "mental" && to === "autonomo" && segment === "solo_psicanalista") return segment;
  return AREAS[area].segments[to][0];
}

// Para virar autônomo, a conta precisa caber em um profissional e um usuário.
// Devolve códigos com a contagem; a tela traduz (settings.page.accountType.blockerProfessionals/blockerMembers).
export type AutonomoBlocker = { code: "professionals" | "members"; count: number };
export function autonomoBlockers({ activeProfessionals, members }: { activeProfessionals: number; members: number }): AutonomoBlocker[] {
  const reasons: AutonomoBlocker[] = [];
  if (activeProfessionals > 1) reasons.push({ code: "professionals", count: activeProfessionals });
  if (members > 1) reasons.push({ code: "members", count: members });
  return reasons;
}
