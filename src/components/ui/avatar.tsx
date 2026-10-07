import { cn, initials } from "@/lib/utils";

// Foto (servida por /api/media, privada) ou, sem foto, as iniciais em círculo accent com a cor de identidade (brand).
export const Avatar = ({ src, name, className }: { src?: string | null; name: string; className?: string }) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element -- imagem privada; o otimizador do Next não tem a sessão
    <img src={src} alt="" className={cn("h-9 w-9 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn("grid h-9 w-9 shrink-0 place-content-center rounded-full bg-accent text-xs font-semibold text-brand", className)}
    >
      {initials(name)}
    </span>
  );
