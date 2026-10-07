// Versão gravada no build (scripts/app-version.mjs via next.config.mjs). Formato AAAA.MM.DD, com -previa ou -dev fora da produção.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT || "";

/** "2026.10.07 (0ffb679)": o que vai no chamado de suporte e no /api/versao. */
export const APP_VERSION_FULL = APP_COMMIT ? `${APP_VERSION} (${APP_COMMIT})` : APP_VERSION;
