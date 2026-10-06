import "./globals.css";
import type { Metadata } from "next";
import { Figtree, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sora", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Salutti",
  description:
    "ERP SaaS para profissionais de saúde mental. Agenda, prontuário, automação financeira, fiscal e IA preditiva - em conformidade com LGPD.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${sora.variable} ${figtree.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
