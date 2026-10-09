// Formatação de valores no idioma da interface, sempre no fuso de São Paulo e com o real (BRL) como moeda.
// Servidor: `const f = await getFormat()`; cliente: `const f = useFormat()`. Mesmas funções nos dois.
import { TZ } from "@/lib/dates";
import { DEFAULT_LOCALE } from "./config";

export function formatters(locale: string = DEFAULT_LOCALE) {
  const nf = (o?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, o);
  const df = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: TZ, ...o });
  return {
    locale,
    money: (value: number) => nf({ style: "currency", currency: "BRL" }).format(value),
    number: (value: number) => nf().format(value),
    // Recebe pontos percentuais (12.5 → "12,5%"), não fração.
    percent: (value: number, digits = 1) =>
      `${nf({ minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "negative" }).format(value)}%`,
    date: (d: Date | string) => df({ dateStyle: "short" }).format(new Date(d)),
    dateLong: (d: Date | string) => df({ dateStyle: "long" }).format(new Date(d)),
    dateTime: (d: Date | string) => df({ dateStyle: "short", timeStyle: "short" }).format(new Date(d)),
    time: (d: Date | string) => df({ timeStyle: "short" }).format(new Date(d)),
    weekdayDay: (d: Date | string) => df({ weekday: "long", day: "numeric" }).format(new Date(d)),
    weekdayShort: (d: Date | string) => df({ weekday: "short" }).format(new Date(d)).replace(".", ""),
    monthYear: (d: Date | string) => df({ month: "long", year: "numeric" }).format(new Date(d)),
    // Hora em São Paulo (0-23), para saudações.
    hour: (d: Date = new Date()) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(d)),
  };
}

export type Formatters = ReturnType<typeof formatters>;
