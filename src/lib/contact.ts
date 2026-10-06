// Contato da Salutti (suporte, comercial e dúvidas de privacidade sobre a plataforma).
export const SUPPORT_EMAIL = "saluttiapp@gmail.com";

export const supportMailto = (subject?: string) =>
  `mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
