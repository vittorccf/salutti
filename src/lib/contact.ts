// Contato da Salutti (suporte, comercial e dúvidas de privacidade sobre a plataforma).
export const SUPPORT_EMAIL = "saluttiapp@gmail.com";

export const supportMailto = (subject?: string) =>
  `mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

// Perfil da Salutti no Instagram (novidades, fase de testes).
export const INSTAGRAM_HANDLE = "salutti_app";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
