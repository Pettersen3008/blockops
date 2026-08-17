import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

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
    <Card className="metric-card">
      <div className="metric-card__icon"><Icon aria-hidden="true" /></div>
      <p>{label}</p>
      <strong>{value}</strong>
      {normalized !== undefined ? (
        <meter className="meter" aria-label={`${label} utilization`} min={0} max={100} value={normalized}>{normalized}%</meter>
      ) : <span>{message}</span>}
    </Card>
  );
}
