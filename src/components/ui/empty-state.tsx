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
      "flex flex-col items-center justify-center rounded-xl border border-dashed bg-transparent p-10 text-center",
      className,
    )}
  >
    {icon ? <div className="mb-3 text-brand">{icon}</div> : null}
    <h3 className="font-sans text-[15px] font-semibold leading-[22px]">{title}</h3>
    {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);
