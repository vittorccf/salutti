// Termos de Uso e Política de Privacidade da plataforma (páginas públicas /termos e /privacidade).
// Ao mudar o texto de forma relevante, troque a versão (data AAAA-MM-DD): novos cadastros registram a versão nova
// e quem já tem conta vê o aviso de aceite no app (TermsUpdateBanner) até confirmar.
export const LEGAL_VERSION = "2026-10-08";

export const TERMS_PATH = "/termos";
export const PRIVACY_PATH = "/privacidade";

// Quem responde pela plataforma. Os campos vazios ficam fora das páginas; preencha quando houver
// (razão social, CNPJ, endereço e nome do encarregado são esperados pela LGPD, arts. 9º e 41, e pelo Decreto 7.962/2013).
export const LEGAL_ENTITY: { name: string; document?: string; address?: string; dpo?: string } = {
  name: "Salutti",
};

// Prova do aceite gravada no usuário (cadastro e conta criada por convite).
export const termsAcceptance = () => ({ termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION });
