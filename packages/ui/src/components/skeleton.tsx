import type * as React from "react";
import { cn } from "../lib/utils";

/** Плейсхолдер загрузки — повторяет геометрию контента (см. дизайн-систему). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
