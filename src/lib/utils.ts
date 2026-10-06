import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

// Fuso fixo: o servidor (Vercel) roda em UTC e o cliente no fuso do navegador; sem isso
// os horários saem 3h adiantados e o HTML do servidor diverge do cliente.
const TZ = "America/Sao_Paulo";

export const formatDateBR = (date: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ }).format(new Date(date));

export const formatDateTimeBR = (date: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(new Date(date));

export const formatTimeBR = (date: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: TZ }).format(new Date(date));

export const formatPercentBR = (value: number, digits = 1) =>
  `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}%`;

// "1 cobrança", "3 cobranças": evita o "cobrança(s)".
export const plural = (n: number, singular: string, pluralForm: string) =>
  `${new Intl.NumberFormat("pt-BR").format(n)} ${n === 1 ? singular : pluralForm}`;

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
