import type { PropsWithChildren } from "react";

import { cn } from "./cn";

const tones = {
  info: "border-[color-mix(in_srgb,var(--information)_25%,var(--border))] bg-information-muted",
  success: "border-[color-mix(in_srgb,var(--primary-hover)_35%,var(--border))] bg-success-muted",
  warning: "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-warning-muted",
  danger: "border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] bg-[var(--danger-soft)]",
} as const;

export type NoticeTone = keyof typeof tones;

/** An inline message about the surface it sits in. `danger` announces itself; the rest are polite. */
export function Notice({ tone = "info", children }: PropsWithChildren<{ tone?: NoticeTone }>) {
  return (
    <div
      data-slot="notice"
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "my-3.5 flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm leading-6 text-foreground [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-current",
        tones[tone],
      )}
    >
      {children}
    </div>
  );
}
