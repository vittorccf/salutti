import { cn } from "@/lib/utils";

type LogoProps = {
  /** horizontal = símbolo + nome; symbol = só as figuras; icon = figuras no quadrado teal; wordmark = só o nome */
  variant?: "horizontal" | "symbol" | "icon" | "wordmark";
  /** negative = branco, para fundo teal ou foto escura */
  tone?: "default" | "negative";
  /** tamanho do nome em px (o símbolo acompanha); no icon, o lado do quadrado */
  size?: number;
  className?: string;
};

// Logo Vínculo: duas figuras (o "tt") unidas pela barra damasco. Ver design system Salutti.
const Figures = ({ figure, transform }: { figure: string; transform?: string }) => (
  <g transform={transform}>
    <circle cx="42" cy="16" r="9" className={cn("fill-current", figure)} />
    <circle cx="82" cy="16" r="9" className={cn("fill-current", figure)} />
    <path d="M42 36 V84 Q42 102 60 102" className={cn("fill-none stroke-current", figure)} strokeWidth={13} strokeLinecap="round" />
    <path d="M82 36 V84 Q82 102 100 102" className={cn("fill-none stroke-current", figure)} strokeWidth={13} strokeLinecap="round" />
    <path d="M20 54 H104" className="fill-none stroke-current text-brand-apricot" strokeWidth={13} strokeLinecap="round" />
  </g>
);

export const Logo = ({ variant = "horizontal", tone = "default", size = 22, className }: LogoProps) => {
  const negative = tone === "negative";

  if (variant === "icon") {
    return (
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Salutti" className={cn("shrink-0", className)}>
        <rect x="4" y="4" width="112" height="112" rx="32" className={cn("fill-current", negative ? "text-white" : "text-brand-teal")} />
        <Figures
          figure={negative ? "text-brand-teal" : "text-brand-mist"}
          transform="translate(60 60) scale(0.66) translate(-62 -58)"
        />
      </svg>
    );
  }

  const figure = negative ? "text-white" : "text-brand-teal dark:text-brand-teal-light";

  return (
    <span
      role="img"
      aria-label="Salutti"
      className={cn(
        "inline-flex items-center gap-[0.36em] font-display font-semibold leading-none tracking-[-0.03em]",
        negative ? "text-white" : "text-brand-ink dark:text-foreground",
        className,
      )}
      style={{ fontSize: size }}
    >
      {variant !== "wordmark" ? (
        <svg viewBox="10 4 104 108" aria-hidden className="h-[1.8em] w-auto shrink-0">
          <Figures figure={figure} />
        </svg>
      ) : null}
      {variant !== "symbol" ? (
        <span aria-hidden>
          salu<span className={negative ? undefined : "text-brand-teal dark:text-brand-teal-light"}>tt</span>
          <span className="text-brand-apricot">i</span>
        </span>
      ) : null}
    </span>
  );
};
