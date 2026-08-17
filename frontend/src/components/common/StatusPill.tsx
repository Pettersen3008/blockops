import type { PropsWithChildren } from "react";

export function StatusPill({
  tone,
  children,
}: PropsWithChildren<{ tone: "good" | "warn" | "bad" | "neutral" | "info" }>) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}
