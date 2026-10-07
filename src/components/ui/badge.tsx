import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand text-brand-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/[.12] text-destructive-strong",
        outline: "border-border text-foreground",
        success: "border-transparent bg-success/[.12] text-success-strong",
        warning: "border-transparent bg-warning/[.12] text-warning-strong",
        muted: "border-transparent bg-muted text-muted-foreground",
        highlight: "border-transparent bg-highlight text-highlight-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

// <span> (não <div>): o Badge aparece dentro de <p> em várias telas e <div> ali quebra a hidratação.
export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
