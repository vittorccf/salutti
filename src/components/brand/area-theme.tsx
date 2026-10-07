"use client";
import { useEffect } from "react";

// Marca a área também no <html>: menus e gavetas renderizados fora do shell (portais) recebem o mesmo tema.
// O shell já vem com data-area do servidor; isto só cobre o que é montado direto no <body>.
export function AreaTheme({ area }: { area: string }) {
  useEffect(() => {
    const root = document.documentElement;
    if (area === "mental") delete root.dataset.area;
    else root.dataset.area = area;
    return () => {
      delete root.dataset.area;
    };
  }, [area]);
  return null;
}
