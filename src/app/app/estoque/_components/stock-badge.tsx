import { getTranslations } from "@/i18n/server";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;

// Situação de produto (ok, baixo, vencendo, vencido) e de lote (inclui aberto_vencido), sempre com palavra.
const variants: Record<string, Variant> = {
  ok: "success",
  baixo: "warning",
  vencendo: "warning",
  vencido: "destructive",
  aberto_vencido: "destructive",
  inativo: "muted",
  esgotado: "muted",
};

export async function StockBadge({ status }: { status: string }) {
  const t = await getTranslations("stock.status");
  return <Badge variant={variants[status] ?? "muted"}>{t.has(status) ? t(status) : status}</Badge>;
}
