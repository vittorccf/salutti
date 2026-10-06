// Telefones: guardados no padrão internacional E.164 ("+5562999990000") e exibidos formatados.
// Formatação e validação pelo libphonenumber-js com os metadados completos (/max): o pacote padrão
// aceita celular brasileiro sem o 9º dígito, o erro de digitação mais comum.
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from "libphonenumber-js/max";

export type { CountryCode };
export const DEFAULT_COUNTRY: CountryCode = "BR";

export type CountryOption = { code: CountryCode; name: string; dial: string };

// Lista de países com nome no idioma da interface e DDI, ordenada por nome (Brasil primeiro).
export function countryOptions(locale = "pt-BR"): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const list = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    dial: `+${getCountryCallingCode(code)}`,
  }));
  list.sort((a, b) => a.name.localeCompare(b.name, locale));
  const br = list.findIndex((c) => c.code === DEFAULT_COUNTRY);
  if (br > 0) list.unshift(...list.splice(br, 1));
  return list;
}

// Formata enquanto a pessoa digita, no padrão do país escolhido.
export function formatAsYouType(raw: string, country: CountryCode) {
  return new AsYouType(country).input(raw);
}

// Números que não servem para falar com uma pessoa (0800, tarifados, compartilhados).
const NOT_PERSONAL = new Set(["TOLL_FREE", "PREMIUM_RATE", "SHARED_COST", "UAN", "PAGER", "VOICEMAIL"]);
export const isContactPhone = (p: PhoneNumber | undefined) =>
  Boolean(p?.isValid() && !NOT_PERSONAL.has(p.getType() ?? ""));

// Converte o que foi digitado (com ou sem DDI) para E.164. Inválido → null.
export function toE164(raw: string | null | undefined, country: CountryCode = DEFAULT_COUNTRY): string | null {
  if (!raw?.trim()) return null;
  const parsed = parsePhoneNumberFromString(raw, country);
  return isContactPhone(parsed) ? parsed!.number : null;
}

export const isCountryCode = (c: unknown): c is CountryCode =>
  typeof c === "string" && (getCountries() as string[]).includes(c);

// Telefone salvo → país e texto para exibir. Números antigos sem DDI são tratados como do Brasil.
export function describePhone(value: string | null | undefined) {
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, DEFAULT_COUNTRY);
  if (!parsed) return { country: null, display: value, e164: null };
  const country = parsed.country ?? null;
  const display = country === DEFAULT_COUNTRY ? parsed.formatNational() : parsed.formatInternational();
  return { country, display, e164: parsed.number };
}

// Link do WhatsApp (wa.me exige só dígitos, com DDI).
export const whatsappLink = (e164: string, text?: string) =>
  `https://wa.me/${e164.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
