import { cn, initials } from "@/lib/utils";

// Foto (servida por /api/media, privada) ou, sem foto, as iniciais no círculo teal.
export const Avatar = ({ src, name, className }: { src?: string | null; name: string; className?: string }) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element -- imagem privada; o otimizador do Next não tem a sessão
    <img src={src} alt="" className={cn("h-9 w-9 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn("grid h-9 w-9 shrink-0 place-content-center rounded-full bg-primary text-xs font-semibold text-primary-foreground", className)}
    >
      {initials(name)}
    </span>
  );
