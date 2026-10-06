// Configuração do next-intl por requisição (sem idioma na URL): cookie salutti_locale (gravado ao escolher o
// idioma em Ajustes e no login) → idioma do navegador → pt-BR.
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchLocale, NAMESPACES, type Locale } from "./config";
import { TZ } from "@/lib/dates";

type Messages = Record<string, unknown>;

const load = async (locale: Locale): Promise<Messages> => {
  const parts = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        return [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const;
      } catch {
        return [ns, {}] as const;
      }
    }),
  );
  return Object.fromEntries(parts);
};

// Chaves que faltam no idioma escolhido ficam com o texto em pt-BR.
const merge = (base: Messages, over: Messages): Messages => {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" ? merge(base[k] as Messages, v as Messages) : v;
  }
  return out;
};

export const resolveLocale = (): Locale => {
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return matchLocale(headers().get("accept-language"));
};

export default getRequestConfig(async () => {
  const locale = resolveLocale();
  const base = await load(DEFAULT_LOCALE);
  const messages = locale === DEFAULT_LOCALE ? base : merge(base, await load(locale));
  return { locale, messages, timeZone: TZ };
});
