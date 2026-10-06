import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** horizontal = símbolo + nome; symbol = só os balões; icon = balões no quadrado com degradê; wordmark = só o nome */
  variant?: "horizontal" | "symbol" | "icon" | "wordmark";
  /** negative = branco (sobre degradê ou foto escura); mono = currentColor, sem transparência */
  tone?: "default" | "negative" | "mono";
  /** altura de referência em px (tamanho da fonte do nome; no icon, o lado do quadrado) */
  size?: number;
  className?: string;
};

// Logo Diálogo (design system Salutti 2.0): dois balões de fala que se encontram e se sobrepõem, ao lado do
// nome "salutti" em curvas ("salu" leve, "tti" seminegrito) com o pingo do "i" em balão pêssego.
// Geometria copiada do componente Logo do design system; nunca redesenhar.
const GEO = {
  a: "M29.0 35.0V21.0A14.0 14.0 0 0 1 43.0 7.0A14.0 14.0 0 0 1 57.0 21.0A14.0 14.0 0 0 1 43.0 35.0Z",
  b: "M35.0 29.0V43.0A14.0 14.0 0 0 1 21.0 57.0A14.0 14.0 0 0 1 7.0 43.0A14.0 14.0 0 0 1 21.0 29.0Z",
  word: "M270 772Q199 772 150.5 749.5Q102 727 76.0 687.0Q50 647 46 597L115 592Q121 645 158.0 677.0Q195 709 270 709Q333 709 366.0 688.0Q399 667 399 623Q399 599 389.0 582.5Q379 566 348.0 553.5Q317 541 255 530Q181 516 140.5 496.0Q100 476 84.5 447.0Q69 418 69 377Q69 306 120.5 262.0Q172 218 263 218Q331 218 374.5 241.5Q418 265 440.5 303.0Q463 341 469 384L400 390Q397 361 382.5 336.5Q368 312 339.0 296.5Q310 281 261 281Q201 281 169.5 306.5Q138 332 138 374Q138 403 149.0 421.5Q160 440 189.0 451.5Q218 463 271 472Q348 484 391.0 503.5Q434 523 451.5 552.0Q469 581 469 622Q469 694 414.5 733.0Q360 772 270 772Z M700 772Q620 772 572.0 733.5Q524 695 524.0 629.0Q524 563 566.0 525.0Q608 487 689 472L885 435Q885 356 851.0 318.5Q817 281 748 281Q687 281 651.0 310.0Q615 339 603 392L533 386Q548 309 603.5 263.5Q659 218 748 218Q847 218 899.0 274.0Q951 330 951 434V655Q951 682 959.5 691.5Q968 701 987 701H1003V760Q999 761 991.5 761.5Q984 762 976 762Q945 762 924.5 751.0Q904 740 895 715Q888 697 886 668Q876 691 857 710Q829 739 788.0 755.5Q747 772 700 772ZM706 713Q761 713 801.0 691.0Q841 669 863.0 631.5Q885 594 885 547V494L703 528Q646 539 619.5 562.0Q593 585 593 623Q593 666 623.0 689.5Q653 713 706 713Z M1166 760Q1121 760 1095.0 737.5Q1069 715 1069 667V50H1135V662Q1135 681 1145.0 691.0Q1155 701 1175 701H1217V760Z M1462 772Q1383 772 1335.5 718.5Q1288 665 1288 571V230H1354V551Q1354 633 1385.5 673.0Q1417 713 1479 713Q1548 713 1587.5 668.0Q1627 623 1627 546V230H1693V760H1631L1630 664Q1614 707 1581 734Q1534 772 1462 772Z M2021 760Q1941 760 1903.5 723.0Q1866 686 1866 607V325H1782V226H1866V101H1994V226H2135V325H1994V595Q1994 632 2010.0 646.5Q2026 661 2060 661H2135V760Z M2410 760Q2330 760 2292.5 723.0Q2255 686 2255 607V325H2171V226H2255V101H2383V226H2524V325H2383V595Q2383 632 2399.0 646.5Q2415 661 2449 661H2524V760Z M2585 760V226H2713V760Z",
  dot: "M2574.5 172V97.0A75.0 75.0 0 0 1 2649.5 22A75.0 75.0 0 0 1 2724.5 97.0A75.0 75.0 0 0 1 2649.5 172Z",
};
const WORD_BOX = "0 20 2784 740";

export const LogoDialogo = ({ variant = "horizontal", tone = "default", size = 22, className }: LogoProps) => {
  const id = useId().replace(/:/g, "");
  const grad = `sl-logo-grad-${id}`;
  const iconGrad = `sl-icon-grad-${id}`;

  // Cor dos balões: no Dia, degradê pervinca → pêssego; na Noite, névoa (o degradê some sobre o fundo escuro).
  const markA =
    tone === "negative" ? "fill-white" : tone === "mono" ? "fill-current" : "fill-[var(--logo-mark)] dark:fill-brand-mist";
  const markB = tone === "mono" ? "" : "opacity-60";
  const ink = tone === "negative" ? "fill-white" : tone === "mono" ? "fill-current" : "fill-brand-ink dark:fill-foreground";
  const dot = tone === "mono" ? "fill-current" : "fill-brand-peach";

  const defs = (
    <defs>
      <linearGradient id={grad} x1="0" y1="64" x2="64" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#4a57c9" />
        <stop offset="0.55" stopColor="#8a92d8" />
        <stop offset="1" stopColor="#eea58c" />
      </linearGradient>
      <linearGradient id={iconGrad} x1="0" y1="64" x2="64" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#0c1117" />
        <stop offset="0.45" stopColor="#3b5674" />
        <stop offset="0.75" stopColor="#8aa4c0" />
        <stop offset="1" stopColor="#eeb59a" />
      </linearGradient>
    </defs>
  );
  const style = { ["--logo-mark" as string]: `url(#${grad})` };

  if (variant === "icon") {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Salutti" className={cn("shrink-0", className)}>
        {defs}
        <rect width="64" height="64" rx="18" fill={`url(#${iconGrad})`} />
        <g transform="translate(32 32) scale(.66) translate(-32 -32)">
          <path d={GEO.a} fill="#fff" />
          <path d={GEO.b} fill="#fff" fillOpacity={0.6} />
        </g>
      </svg>
    );
  }

  return (
    <span
      role="img"
      aria-label="Salutti"
      className={cn("inline-flex items-center gap-[0.3em] leading-none", tone === "mono" && "text-foreground", className)}
      style={{ fontSize: size, ...style }}
    >
      {variant !== "wordmark" ? (
        <svg viewBox="0 0 64 64" aria-hidden className="h-[1.15em] w-auto shrink-0 overflow-visible">
          {defs}
          <path d={GEO.a} className={markA} />
          <path d={GEO.b} className={cn(markA, markB)} />
        </svg>
      ) : null}
      {variant !== "symbol" ? (
        <svg viewBox={WORD_BOX} aria-hidden className="h-[0.92em] w-auto overflow-visible">
          <path d={GEO.word} className={ink} />
          <path d={GEO.dot} className={dot} />
        </svg>
      ) : null}
    </span>
  );
};
