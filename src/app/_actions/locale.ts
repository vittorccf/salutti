"use server";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

// Troca de idioma antes de entrar (login e cadastro): vale para este navegador; ao entrar, vira o idioma do
// perfil de quem ainda não tinha escolhido um (ver createSession em src/lib/auth.ts).
export async function setLocaleAction(locale: string) {
  if (isLocale(locale)) cookies().set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else cookies().delete(LOCALE_COOKIE);
}
