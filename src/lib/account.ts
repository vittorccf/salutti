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

// Áreas de atendimento oferecidas para cada tipo de conta.
export const SEGMENTS: Record<AccountType, { value: string; label: string }[]> = {
  autonomo: [
    { value: "solo_psicologo", label: "Psicologia (com CRP)" },
    { value: "solo_psicanalista", label: "Psicanálise ou outra terapia (sem exigência de CRP)" },
    { value: "odonto", label: "Odontologia" },
  ],
  clinica: [
    { value: "clinica", label: "Clínica multiprofissional" },
    { value: "ubs", label: "UBS ou serviço público" },
    { value: "odonto", label: "Clínica odontológica" },
  ],
};

// Segmento válido para o tipo de conta dentro da área (Salutti ou Salutti Estética).
export const segmentAllowed = (type: AccountType, segment: string, area: Area = "mental") =>
  AREAS[area].segments[type].includes(segment);

// Na troca de tipo, a área de atendimento acompanha: "clínica multiprofissional" vira "psicologia" e vice-versa.
export function segmentAfterMigration(to: AccountType, segment: string) {
  const area = areaOfSegment(segment);
  if (segmentAllowed(to, segment, area)) return segment;
  if (area === "estetica") return to === "clinica" ? "estetica_clinica" : AREAS.estetica.segments.autonomo[0];
  return to === "clinica" ? "clinica" : segment === "solo_psicanalista" ? "solo_psicanalista" : "solo_psicologo";
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
