import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export const EmptyState = ({ icon, title, description, action, className }: Props) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-10 text-center",
      className,
    )}
  >
    {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
    <h3 className="text-base font-semibold">{title}</h3>
    {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);
