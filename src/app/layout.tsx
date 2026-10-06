import "./globals.css";
import type { Metadata } from "next";
import { Figtree, Sora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sora", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.meta");
  return { title: "Salutti", description: t("description") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Só o que os componentes do cliente usam vai para o navegador (o resto é renderizado no servidor).
  const all = await getMessages();
  const settings = all.settings as Record<string, unknown> | undefined;
  const messages = { common: all.common, auth: all.auth, finance: all.finance, settings: { access: settings?.access } };
  return (
    <html lang={locale} suppressHydrationWarning className={`${sora.variable} ${figtree.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
