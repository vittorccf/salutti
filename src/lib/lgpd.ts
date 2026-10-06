// Rótulos das finalidades/bases legais de consentimento (valores em prisma/schema.prisma, ConsentRecord.purpose).
const consentPurposeLabels: Record<string, string> = {
  tutela_saude: "Tutela da saúde",
  comunicacao_marketing: "Comunicação e marketing",
  telemedicina: "Telemedicina",
  compartilhamento: "Compartilhamento de dados",
};

export const consentPurposeLabel = (value: string) =>
  Object.hasOwn(consentPurposeLabels, value) ? consentPurposeLabels[value] : value.replaceAll("_", " ");
