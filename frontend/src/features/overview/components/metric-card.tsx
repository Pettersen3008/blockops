import type { LucideIcon } from "lucide-react";
import { Card } from "@blockops/ui";

export function MetricCard({
  icon: Icon,
  label,
  value,
  percent,
  message,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  percent?: number;
  message?: string;
}) {
  const normalized = percent === undefined ? undefined : Math.min(100, Math.max(0, percent));
  return (
    <Card className="flex min-h-[168px] min-w-0 flex-col p-[19px] max-[660px]:min-h-[145px]">
      <div className="grid size-9 place-items-center rounded-[10px] bg-accent text-primary-hover [&_svg]:w-[19px]"><Icon aria-hidden="true" /></div>
      <p className="mt-[18px] mb-1 text-xs text-muted-foreground">{label}</p>
      <strong className="overflow-hidden text-[1.05rem] text-ellipsis whitespace-nowrap" title={value}>{value}</strong>
      {normalized !== undefined ? (
        <meter className="mt-auto h-[5px] w-full appearance-none overflow-hidden rounded-full border-0 bg-muted [&::-moz-meter-bar]:rounded-[inherit] [&::-moz-meter-bar]:bg-primary-hover [&::-webkit-meter-bar]:rounded-[inherit] [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-muted [&::-webkit-meter-optimum-value]:rounded-[inherit] [&::-webkit-meter-optimum-value]:bg-primary-hover" aria-label={`${label} utilization`} min={0} max={100} value={normalized}>{normalized}%</meter>
      ) : <span className="mt-auto text-xs text-muted-foreground">{message}</span>}
    </Card>
  );
}
