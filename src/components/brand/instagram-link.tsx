import { Instagram } from "lucide-react";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/contact";
import { cn } from "@/lib/utils";

// Link para o perfil da Salutti no Instagram. "Instagram" é nome próprio: igual em todos os idiomas.
export function InstagramLink({ className }: { className?: string }) {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5 text-brand underline-offset-4 hover:underline", className)}
    >
      <Instagram className="h-4 w-4" aria-hidden />
      <span className="sr-only">Instagram </span>@{INSTAGRAM_HANDLE}
    </a>
  );
}
