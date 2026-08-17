import type { PropsWithChildren } from "react";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-[color-mix(in_srgb,var(--information)_25%,var(--border))] bg-information-muted",
  success: "border-[color-mix(in_srgb,var(--primary-hover)_35%,var(--border))] bg-success-muted",
  warning: "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-warning-muted",
  danger: "border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] bg-[var(--danger-soft)]",
} as const;

export function Notice({ tone = "info", children }: PropsWithChildren<{ tone?: keyof typeof tones }>) {
  return (
    <Alert className={cn("notice my-3.5 flex items-center gap-2.5 rounded-xl px-3.5 py-3 leading-6 text-foreground [&_svg]:size-[18px] [&_svg]:shrink-0", tones[tone])} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </Alert>
  );
}
