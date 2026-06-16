import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Salutti — ERP de Saúde com IA Financeira",
  description:
    "ERP SaaS para profissionais de saúde mental. Agenda, prontuário, automação financeira, fiscal e IA preditiva — em conformidade com LGPD.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
