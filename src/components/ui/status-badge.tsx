"use client";
import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;

// Os status ficam em inglês no banco (ver comentários em prisma/schema.prisma);
// aqui viram a cor que o design system define para cada estado; o texto vem de common.status.<tipo>.<status>.
const statusMap = {
  appointment: {
    scheduled: "muted",
    confirmed: "success",
    done: "success",
    // Faltar ou atrasar faz parte do processo: aviso, não erro (vermelho só para falhas técnicas).
    no_show: "warning",
    cancelled: "secondary",
  },
  charge: {
    pending: "warning",
    paid: "success",
    overdue: "warning",
    cancelled: "secondary",
    refunded: "secondary",
  },
  receitaSaude: {
    queued: "muted",
    sent: "warning",
    confirmed: "success",
    error: "destructive",
  },
  invoice: {
    queued: "muted",
    issued: "success",
    rejected: "destructive",
  },
  message: {
    queued: "muted",
    sent: "success",
    failed: "destructive",
  },
  integration: {
    real: "success",
    sandbox: "warning",
    heurístico: "muted",
  },
} satisfies Record<string, Record<string, Variant>>;

export type StatusKind = keyof typeof statusMap;

type Props = Omit<BadgeProps, "variant" | "children"> & { kind: StatusKind; status: string | null | undefined };

export const StatusBadge = ({ kind, status, ...props }: Props) => {
  const t = useTranslations("common.status");
  if (!status) return <Badge variant="muted" {...props}>-</Badge>;
  const map = statusMap[kind] as Record<string, Variant>;
  const variant = Object.hasOwn(map, status) ? map[status] : "muted";
  const key = `${kind}.${status}`;
  return (
    <Badge variant={variant} {...props}>
      {t.has(key) ? t(key) : status}
    </Badge>
  );
};
