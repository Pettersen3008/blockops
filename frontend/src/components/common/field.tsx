import type { PropsWithChildren } from "react";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  hint,
  hintId,
  hintIsError = false,
  htmlFor,
  children,
}: PropsWithChildren<{
  label: string;
  hint?: string;
  hintId?: string;
  hintIsError?: boolean;
  htmlFor: string;
}>) {
  return (
    <div className="grid gap-[7px]">
      <Label className="text-[0.84rem] font-bold" htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p id={hintId} className="m-0 text-[0.78rem] leading-[1.45] text-muted-foreground" role={hintIsError ? "alert" : undefined}>{hint}</p> : null}
    </div>
  );
}
