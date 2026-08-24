import type { PropsWithChildren } from "react";

export function StatusPill({
  tone,
  children,
}: PropsWithChildren<{ tone: "good" | "warn" | "bad" | "neutral" | "info" }>) {
  const tones = {
    good: "bg-accent text-primary",
    warn: "bg-warning-muted text-warning",
    bad: "bg-[var(--danger-soft)] text-destructive",
    neutral: "bg-muted text-muted-foreground",
    info: "bg-information-muted text-information",
  };
  return <span className={`inline-flex min-h-[25px] w-fit items-center rounded-full px-[9px] py-[3px] text-[0.72rem] font-semibold tracking-[0.04em] uppercase before:mr-1.5 before:size-1.5 before:rounded-full before:bg-current before:content-[''] ${tones[tone]}`}>{children}</span>;
}
