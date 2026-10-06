// Rótulos de exibição para valores de domínio guardados como código no banco
// (ver comentários em prisma/schema.prisma). Valor desconhecido volta como veio.
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
export const chargeDisplayStatus = (status: string, dueDate: Date, now = new Date()) =>
  status === "pending" && dueDate < now ? "overdue" : status;

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
