// Receita Saúde (obrigatória desde 01/2025 para profissional de saúde PF): a Receita não oferece API. O recibo é
// gerado pelo app oficial ou em lote, importando no Carnê-Leão Web o CSV com indicador "S" (src/lib/tax.ts,
// /app/fiscal/exportar). Aqui o recibo nasce "a enviar" e vira "exportado" quando entra num CSV baixado.
import { assertNotSupportSession } from "@/lib/db";

export const receitaSaude = {
  async submit(_input: { receiptNumber: string; patientCpf?: string; amount: number; issuedAt: Date }) {
    // Acesso de suporte é somente leitura: nada sai daqui.
    await assertNotSupportSession();
    return { receitaSaudeId: null, receitaSaudeStatus: "queued" as const };
  },
};
