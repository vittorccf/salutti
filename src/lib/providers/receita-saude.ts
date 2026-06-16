// Receita Saúde - MOCK
// A partir de 01/2025: emissão obrigatória de recibos de serviços de saúde PF
// via app oficial da Receita Federal. Saluti mock simula protocolo + status.

export const receitaSaude = {
  async submit(input: { receiptNumber: string; patientCpf?: string; amount: number; issuedAt: Date }) {
    const protocol = `RS-${input.receiptNumber}-${Date.now().toString(36)}`;
    // Simula 95% sucesso
    const ok = Math.random() > 0.05;
    return {
      receitaSaudeId: protocol,
      receitaSaudeStatus: ok ? ("confirmed" as const) : ("error" as const),
    };
  },
};
