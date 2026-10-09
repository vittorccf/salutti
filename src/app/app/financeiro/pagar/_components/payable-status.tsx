import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { PayableStatus } from "@/lib/payables";

const VARIANT: Record<PayableStatus, NonNullable<BadgeProps["variant"]>> = {
  open: "secondary",
  due_today: "warning",
  partial: "warning",
  overdue: "destructive",
  paid: "success",
  cancelled: "muted",
};

// Situação sempre com palavra, nunca só a cor (design system).
export const PayableStatusBadge = ({ status, label }: { status: PayableStatus; label: string }) => (
  <Badge variant={VARIANT[status]}>{label}</Badge>
);
