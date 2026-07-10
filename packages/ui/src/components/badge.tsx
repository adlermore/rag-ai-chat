import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * Бейдж (shadcn). Варианты confidence-* — визуальный язык уверенности ответа
 * (см. docs/03-DESIGN-SYSTEM.md): high/low/refused. Цвета — через токены.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-foreground tabular-nums",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        confidenceHigh:
          "border-transparent bg-[color:var(--confidence-high)]/12 text-[color:var(--confidence-high)]",
        confidenceLow:
          "border-transparent bg-[color:var(--confidence-low)]/12 text-[color:var(--confidence-low)]",
        confidenceNone:
          "border-transparent bg-muted text-[color:var(--confidence-none)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
