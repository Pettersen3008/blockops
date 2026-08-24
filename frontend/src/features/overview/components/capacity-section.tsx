import { Cpu, Database, HardDrive, MemoryStick } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/formatters";
import type { Overview } from "../overview-schema";
import { MetricCard } from "./metric-card";

export function CapacitySection({ data }: { data: Overview }) {
  return (
    <section aria-labelledby="capacity-heading">
      <div className="mb-[13px] flex items-end justify-between gap-5 [&_h2]:m-0 [&>span]:text-xs [&>span]:text-muted-foreground">
        <div><p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Capacity</p><h2 id="capacity-heading">Resource envelope</h2></div>
        <span>Refreshes every 10 seconds</span>
      </div>
      <div className="grid grid-cols-1 gap-3.5 min-[661px]:grid-cols-2 min-[1181px]:grid-cols-4">
        <MetricCard icon={Cpu} label="CPU" value={data.metrics.available ? `${data.metrics.value.cpuPercent.toFixed(1)}%` : "Unavailable"} percent={data.metrics.available ? data.metrics.value.cpuPercent : undefined} message={data.metrics.message} />
        <MetricCard icon={MemoryStick} label="Memory" value={data.metrics.available ? `${formatBytes(data.metrics.value.memoryUsageBytes)} / ${formatBytes(data.metrics.value.memoryLimitBytes)}` : "Unavailable"} percent={data.metrics.available && data.metrics.value.memoryLimitBytes ? data.metrics.value.memoryUsageBytes / data.metrics.value.memoryLimitBytes * 100 : undefined} message={data.metrics.message} />
        <MetricCard icon={HardDrive} label="Disk" value={data.disk.available ? `${formatBytes(data.disk.value.usedBytes)} / ${formatBytes(data.disk.value.totalBytes)}` : "Unavailable"} percent={data.disk.available && data.disk.value.totalBytes ? data.disk.value.usedBytes / data.disk.value.totalBytes * 100 : undefined} message={data.disk.message} />
        <Card className="flex min-h-[168px] min-w-0 flex-col p-[19px] max-[660px]:min-h-[145px]">
          <div className="grid size-9 place-items-center rounded-[10px] bg-accent text-primary-hover [&_svg]:w-[19px]"><Database aria-hidden="true" /></div>
          <p className="mt-[18px] mb-1 text-xs text-muted-foreground">Last successful backup</p>
          <strong className="overflow-hidden text-[1.05rem] text-ellipsis whitespace-nowrap" title={formatDate(data.lastSuccessfulBackup?.createdAt)}>{formatDate(data.lastSuccessfulBackup?.createdAt)}</strong>
          <span className="mt-auto text-xs text-muted-foreground">{data.lastSuccessfulBackup ? formatBytes(data.lastSuccessfulBackup.sizeBytes) : "No backup has completed yet."}</span>
        </Card>
      </div>
    </section>
  );
}
