import { Badge, type BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;
type Entry = { label: string; variant: Variant };

// Os status ficam em inglês no banco (ver comentários em prisma/schema.prisma);
// aqui viram o texto e a cor que o design system define para cada estado.
const statusMap = {
  appointment: {
    scheduled: { label: "Agendada", variant: "muted" },
    confirmed: { label: "Confirmada", variant: "success" },
    done: { label: "Realizada", variant: "success" },
    no_show: { label: "Faltou", variant: "destructive" },
    cancelled: { label: "Cancelada", variant: "secondary" },
  },
  charge: {
    pending: { label: "Pendente", variant: "warning" },
    paid: { label: "Pago", variant: "success" },
    overdue: { label: "Atrasado", variant: "destructive" },
    cancelled: { label: "Cancelado", variant: "secondary" },
    refunded: { label: "Estornado", variant: "secondary" },
  },
  receitaSaude: {
    queued: { label: "Na fila", variant: "muted" },
    sent: { label: "Aguardando confirmação", variant: "warning" },
    confirmed: { label: "Confirmado", variant: "success" },
    error: { label: "Falhou", variant: "destructive" },
  },
  invoice: {
    queued: { label: "Na fila", variant: "muted" },
    issued: { label: "Nota emitida", variant: "success" },
    rejected: { label: "Rejeitada", variant: "destructive" },
  },
  message: {
    queued: { label: "Na fila", variant: "muted" },
    sent: { label: "Enviada", variant: "success" },
    failed: { label: "Falhou", variant: "destructive" },
  },
  integration: {
    real: { label: "Ativa", variant: "success" },
    sandbox: { label: "Sandbox", variant: "warning" },
    heurístico: { label: "Heurístico", variant: "muted" },
  },
} satisfies Record<string, Record<string, Entry>>;

export type StatusKind = keyof typeof statusMap;

type Props = Omit<BadgeProps, "variant" | "children"> & { kind: StatusKind; status: string | null | undefined };

export const StatusBadge = ({ kind, status, ...props }: Props) => {
  if (!status) return <Badge variant="muted" {...props}>-</Badge>;
  const map = statusMap[kind] as Record<string, Entry>;
  const entry = Object.hasOwn(map, status) ? map[status] : undefined;
  return (
    <Badge variant={entry?.variant ?? "muted"} {...props}>
      {entry?.label ?? status}
    </Badge>
  );
};
