// Provider Pix — MOCK (estilo Asaas / Iugu).
// Em produção: API real para criar QRCode dinâmico + webhook de liquidação.

export const pix = {
  generateCopyPaste(amount: number, txid: string) {
    const cents = Math.round(amount * 100).toString();
    return `00020126360014BR.GOV.BCB.PIX0114SALUTI-DEV0208${txid}520400005303986540${cents.length}${cents}5802BR5915SALUTI SAUDE LTDA6009GOIANIA62070503***6304ABCD`;
  },
  generateChargeId() {
    return `pix_${Math.random().toString(36).slice(2, 10)}`;
  },
};
