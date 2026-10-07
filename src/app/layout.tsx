import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";

// Design system Salutti 2.0: Geist (interface) e Instrument Serif itálico (acento de marketing), servidas daqui.
const geist = localFont({
  src: [
    { path: "./fonts/geist-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/geist-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/geist-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-geist",
  display: "swap",
});
const serif = localFont({
  src: [{ path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" }],
  variable: "--font-serif",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.meta");
  return { title: "Salutti", description: t("description") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Só o que os componentes do cliente usam vai para o navegador (o resto é renderizado no servidor).
  const all = await getMessages();
  const settings = all.settings as Record<string, unknown> | undefined;
  const aesthetics = all.aesthetics as Record<string, unknown> | undefined;
  const messages = {
    common: all.common,
    auth: all.auth,
    finance: all.finance,
    settings: { access: settings?.access },
    // Formulário de procedimento e campo "Procedimento" da nova sessão (Salutti Estética).
    aesthetics: { form: aesthetics?.form, categories: aesthetics?.categories, schedule: aesthetics?.schedule },
  };
  return (
    <html lang={locale} suppressHydrationWarning className={`${geist.variable} ${serif.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
