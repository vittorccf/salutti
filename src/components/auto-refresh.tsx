"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Atualiza os dados da página de tempos em tempos enquanto a aba está visível (conversa do portal sem recarregar).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
