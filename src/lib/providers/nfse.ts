// Provider NFS-e - MOCK (estilo NFE.io / Focus NF-e / Nuvem Fiscal).
// Em produção: chamada async + webhook quando prefeitura responder.

export const nfse = {
  async issue(input: { workspaceId: string; patientName: string; amount: number; serviceCode?: string }) {
    const id = `nfeio_${Math.random().toString(36).slice(2, 12)}`;
    const pdfUrl = `/mock/nfse/${id}.pdf`;
    const xmlUrl = `/mock/nfse/${id}.xml`;
    return {
      externalId: id,
      issStatus: "issued" as const,
      pdfUrl,
      xmlUrl,
      issuedAt: new Date(),
      serviceCode: input.serviceCode ?? "14.01",
    };
  },
};
