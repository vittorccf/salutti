"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// Alterna claro/escuro (backoffice). A escolha fica no navegador e vale também no app (mesma chave do tema).
export function ThemeToggle({ darkLabel, lightLabel }: { darkLabel: string; lightLabel: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // O tema só é conhecido no navegador: até montar, mostra o botão neutro (sem pular de ícone).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => setTheme(isDark ? "light" : "dark")} aria-pressed={isDark}>
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      {isDark ? lightLabel : darkLabel}
    </Button>
  );
}
