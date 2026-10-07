"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  open: boolean;
  hasUnread?: boolean;
};

// Botão flutuante de suporte: balão com três pontos (fechado) que vira um círculo com X (aberto).
// Cores pelos tokens do tema: --brand (fundo) e --brand-foreground (pontos e X); ponto de resposta nova em --brand-peach.
// forwardRef: serve de gatilho do Popover (asChild), que repassa aria-expanded, aria-controls e o clique.
export const SupportButton = React.forwardRef<HTMLButtonElement, Props>(({ open, hasUnread = false, className, ...props }, ref) => {
  const t = useTranslations("support.button");
  const layer = "origin-center transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={hasUnread && !open ? `${t("open")}. ${t("unread")}` : open ? t("close") : t("open")}
      aria-expanded={open}
      className={cn(
        "fixed bottom-4 right-4 z-[35] h-14 w-14 rounded-full transition-opacity duration-150 hover:opacity-[.88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:bottom-6 sm:right-6",
        "[filter:drop-shadow(0_6px_16px_rgba(0,0,0,.18))]",
        className,
      )}
      {...props}
    >
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden className="overflow-visible">
        <g className={cn(layer, open ? "scale-75 opacity-0" : "scale-100 opacity-100")} style={{ transformBox: "fill-box" }}>
          <path d="M56 56H28A28 28 0 0 1 0 28A28 28 0 0 1 28 0A28 28 0 0 1 56 28Z" fill="hsl(var(--brand))" />
          <g fill="hsl(var(--brand-foreground))">
            <circle cx="18" cy="28" r="3.2" />
            <circle cx="28" cy="28" r="3.2" />
            <circle cx="38" cy="28" r="3.2" />
          </g>
        </g>
        <g className={cn(layer, open ? "scale-100 opacity-100" : "scale-75 opacity-0")} style={{ transformBox: "fill-box" }}>
          <circle cx="28" cy="28" r="28" fill="hsl(var(--brand))" />
          <path
            d="M21 21L35 35M35 21L21 35"
            stroke="hsl(var(--brand-foreground))"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </g>
        {hasUnread ? (
          <circle cx="48" cy="9" r="7" fill="hsl(var(--brand-peach))" stroke="hsl(var(--background))" strokeWidth="2.5" />
        ) : null}
      </svg>
    </button>
  );
});
SupportButton.displayName = "SupportButton";
