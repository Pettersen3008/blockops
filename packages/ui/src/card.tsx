import type { ComponentProps } from "react";

import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-[var(--radius)] border border-border bg-card text-card-foreground shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    />
  );
}
