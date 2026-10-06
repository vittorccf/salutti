import { cn } from "@/lib/utils";

// Bandeira do país (SVG em public/flags, do pacote country-flag-icons). Decorativa: o país vem em texto ao lado.
export const Flag = ({ code, className }: { code: string | null | undefined; className?: string }) =>
  code ? (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático pequeno
    <img
      src={`/flags/${code.toUpperCase()}.svg`}
      alt=""
      aria-hidden
      loading="lazy"
      width={20}
      height={14}
      className={cn("inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-border", className)}
    />
  ) : null;
