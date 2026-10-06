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
export const NAMESPACES = ["common", "auth", "public", "dashboard", "settings", "patients", "schedule", "finance"] as const;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

// Accept-Language do navegador → idioma suportado ("pt-PT,pt;q=0.9" → pt-PT; "pt" → pt-BR; "es-AR" → es).
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    if (tag === "pt-pt") return "pt-PT";
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
