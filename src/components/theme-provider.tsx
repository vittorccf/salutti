"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Tema claro por padrão; o escuro é escolha explícita no menu do perfil (ver design system, "Modo escuro").
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="salutti-theme" disableTransitionOnChange>
    {children}
  </NextThemesProvider>
);
