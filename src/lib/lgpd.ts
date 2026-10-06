// Rótulos das finalidades/bases legais de consentimento (valores em prisma/schema.prisma, ConsentRecord.purpose).
const consentPurposeLabels: Record<string, string> = {
  tutela_saude: "Tutela da saúde",
  comunicacao_marketing: "Comunicação e marketing",
  telemedicina: "Telemedicina",
  compartilhamento: "Compartilhamento de dados",
};

export const consentPurposeLabel = (value: string) =>
  Object.hasOwn(consentPurposeLabels, value) ? consentPurposeLabels[value] : value.replaceAll("_", " ");

// Bases legais (ConsentRecord.legalBasis).
const legalBasisLabels: Record<string, string> = {
  consentimento: "Consentimento",
  tutela_saude: "Tutela da saúde",
  obrigacao_legal: "Obrigação legal",
  execucao_contrato: "Execução de contrato",
};

export const legalBasisLabel = (value: string) =>
  Object.hasOwn(legalBasisLabels, value) ? legalBasisLabels[value] : value.replaceAll("_", " ");
