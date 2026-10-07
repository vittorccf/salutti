// Idiomas da interface. pt-BR é o padrão e a fonte dos textos; os outros caem no pt-BR quando falta uma chave.
// A moeda continua sendo o real (BRL) em todos: muda só a forma de escrever números e datas.
export const LOCALES = ["pt-BR", "pt-PT", "es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_COOKIE = "salutti_locale";

// Nome de cada idioma escrito nele mesmo (como aparece no seletor).
export const LOCALE_LABELS: Record<Locale, string> = {
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  es: "Español",
  en: "English",
};

// Arquivos de mensagens por área: messages/<idioma>/<namespace>.json
export const NAMESPACES = ["common", "auth", "public", "dashboard", "settings", "patients", "schedule", "finance", "stock", "aesthetics"] as const;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
