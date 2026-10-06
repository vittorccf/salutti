import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
// Datas sempre exibidas no fuso de São Paulo (convenções em lib/dates.ts).
import { TZ } from "./dates";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);


export const formatDateBR = (date: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ }).format(new Date(date));

export const formatDateTimeBR = (date: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(new Date(date));

export const formatTimeBR = (date: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TZ }).format(new Date(date));

// Recebe pontos percentuais (12.5 → "12,5%"), não fração.
export const formatPercentBR = (value: number, digits = 1) =>
  `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "negative" }).format(value)}%`;

// Saudação pela hora de São Paulo.
export const greetingBR = (date = new Date()) => {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(date));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
};

// "1 cobrança", "3 cobranças": evita o "cobrança(s)".
export const plural = (n: number, singular: string, pluralForm: string) =>
  `${new Intl.NumberFormat("pt-BR").format(n)} ${Math.abs(n) === 1 ? singular : pluralForm}`;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export const randomToken = (length = 24) => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};
