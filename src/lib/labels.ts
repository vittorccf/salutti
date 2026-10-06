// Rótulos de exibição para valores de domínio guardados como código no banco
// (ver comentários em prisma/schema.prisma). Valor desconhecido volta como veio.
import { isPastDue } from "./dates";

const lookup = (map: Record<string, string>) => (value: string | null | undefined) =>
  value == null ? "-" : Object.hasOwn(map, value) ? map[value] : value.replaceAll("_", " ");

export const noteTypeLabel = lookup({
  anamnese: "Anamnese",
  evolucao: "Evolução",
  plano_terapeutico: "Plano terapêutico",
  alta: "Alta",
});

export const paymentMethodLabel = lookup({
  pix: "Pix",
  card: "Cartão",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
});

export const modalityLabel = lookup({
  presencial: "Presencial",
  online: "Online",
});

// Cobrança pendente com vencimento passado aparece como atrasada, mesmo antes do job marcar "overdue".
// Vence no fim do dia (São Paulo): só fica atrasada a partir do dia seguinte.
export const chargeDisplayStatus = (status: string, dueDate: Date, now = new Date()) =>
  status === "pending" && isPastDue(dueDate, now) ? "overdue" : status;

export const planTierLabel = lookup({
  trial: "Teste grátis",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Clínica",
});

export const segmentLabel = lookup({
  solo_psicologo: "Psicólogo autônomo",
  solo_psicanalista: "Psicanalista ou terapeuta",
  clinica: "Clínica",
  ubs: "UBS",
  odonto: "Odontologia",
});

export const professionalTypeLabel = lookup({
  psicologo: "Psicólogo",
  psicanalista: "Psicanalista",
  terapeuta: "Terapeuta",
  psiquiatra: "Psiquiatra",
  dentista: "Dentista",
  medico: "Médico",
});

// UF do conselho no TISS: código IBGE (Tabela 59).
export const UFS: { code: string; sigla: string }[] = [
  ["11", "RO"], ["12", "AC"], ["13", "AM"], ["14", "RR"], ["15", "PA"], ["16", "AP"], ["17", "TO"],
  ["21", "MA"], ["22", "PI"], ["23", "CE"], ["24", "RN"], ["25", "PB"], ["26", "PE"], ["27", "AL"],
  ["28", "SE"], ["29", "BA"], ["31", "MG"], ["32", "ES"], ["33", "RJ"], ["35", "SP"], ["41", "PR"],
  ["42", "SC"], ["43", "RS"], ["50", "MS"], ["51", "MT"], ["52", "GO"], ["53", "DF"],
].map(([code, sigla]) => ({ code, sigla }));

export const ufSigla = (code: string | null | undefined) => UFS.find((u) => u.code === code)?.sigla ?? "-";

export const guideTypeLabel = lookup({ consulta: "Guia de consulta", sp_sadt: "Guia SP/SADT" });
