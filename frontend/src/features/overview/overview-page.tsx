import { useState } from "react";
import {
  Activity,
  Archive,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Play,
  Power,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { ConfirmDialog } from "@/components/common/action-dialog";
import { ErrorState, LoadingState } from "@/components/common/async-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCreateBackup } from "@/features/backups";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { formatBytes, formatDate, formatDuration } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/api-error";
import { MetricCard } from "./components/metric-card";
import { Unavailable } from "./components/unavailable";
import { confirmationFor } from "./overview-actions";
import type { OverviewAction } from "./overview-actions";
import { useOverview, useServerAction } from "./overview-hooks";
import type { ServerState } from "./overview-schemas";

export function OverviewPage({ session }: { session: Session }) {
  const [pendingAction, setPendingAction] = useState<OverviewAction | null>(null);
  const overview = useOverview();
  const backup = useCreateBackup(session.csrfToken, {
    onSettled: () => setPendingAction(null),
  });
  const serverAction = useServerAction(session.csrfToken, () => setPendingAction(null));

  const runPending = () => {
    if (pendingAction === "backup") backup.mutate();
    if (pendingAction === "start" || pendingAction === "stop" || pendingAction === "restart") {
      serverAction.mutate(pendingAction);
    }
  };

  if (overview.isLoading) return <LoadingState label="Reading live server state" />;
  if (overview.isError || !overview.data) {
    return <ErrorState message={safeErrorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  }

  const data = overview.data;
  const state = data.server.available ? data.server.value.state : "unknown";
  const canBackup = hasPermission(session.user.role, "backups.create");
  const canRestart = hasPermission(session.user.role, "server.restart");
  const isAdministrator = session.user.role === "administrator";
  const mutationError = backup.error ?? serverAction.error;
  const confirmation = confirmationFor(pendingAction);

  return (
    <>
      <PageHeader
        eyebrow="Server pulse"
        title="Overview"
        description="One honest view of runtime health, players, capacity, and recent operational signals."
        actions={
          <>
            {canBackup ? <Button variant="secondary" onClick={() => setPendingAction("backup")}><Archive aria-hidden="true" /> Back up now</Button> : null}
            {canRestart ? <Button onClick={() => setPendingAction("restart")}><RefreshCw aria-hidden="true" /> Graceful restart</Button> : null}
          </>
        }
      />
      {mutationError ? <Notice tone="danger">{safeErrorMessage(mutationError)}</Notice> : null}
      <div className="overview-lead">
        <Card className="server-card">
          <div className="server-card__signal" data-state={state}><span /><span /><span /></div>
          <div className="server-card__body">
            <div className="server-card__heading">
              <div>
                <p className="eyebrow">Configured Java server</p>
                <h2>{data.server.available ? "Minecraft server" : "Integration unavailable"}</h2>
              </div>
              <StatusPill tone={stateTone(state)}>{state}</StatusPill>
            </div>
            {data.server.available ? (
              <dl className="inline-facts">
                <div><dt>Software</dt><dd>{data.server.value.software || "Unavailable"}</dd></div>
                <div><dt>Version</dt><dd>{data.server.value.version || "Unavailable"}</dd></div>
                <div><dt>Uptime</dt><dd>{formatDuration(data.server.value.uptimeSeconds)}</dd></div>
                <div><dt>Container image</dt><dd title={data.server.value.image}>{data.server.value.image || "Unavailable"}</dd></div>
              </dl>
            ) : <Unavailable message={data.server.message} />}
          </div>
          {isAdministrator ? (
            <div className="server-card__controls" aria-label="Server lifecycle controls">
              <Button variant="ghost" onClick={() => setPendingAction("start")} disabled={state === "online"}><Play aria-hidden="true" /> Start</Button>
              <Button variant="ghost" onClick={() => setPendingAction("stop")} disabled={state === "offline"}><Power aria-hidden="true" /> Stop</Button>
            </div>
          ) : null}
        </Card>
        <Card className="players-now">
          <div className="card-title-row"><Users aria-hidden="true" /><div><p className="eyebrow">Right now</p><h2>Players</h2></div></div>
          {data.players.available ? (
            <>
              <p className="players-now__count"><strong>{data.players.value.online}</strong><span> / {data.players.value.max} online</span></p>
              {data.players.value.names.length > 0 ? (
                <ul className="player-chips">{data.players.value.names.map((name) => <li key={name}>{name}</li>)}</ul>
              ) : <p className="muted">The server is quiet.</p>}
            </>
          ) : <Unavailable message={data.players.message} />}
        </Card>
      </div>
      <section aria-labelledby="capacity-heading">
        <div className="section-heading"><div><p className="eyebrow">Capacity</p><h2 id="capacity-heading">Resource envelope</h2></div><span>Refreshes every 10 seconds</span></div>
        <div className="metric-grid">
          <MetricCard icon={Cpu} label="CPU" value={data.metrics.available ? `${data.metrics.value.cpuPercent.toFixed(1)}%` : "Unavailable"} percent={data.metrics.available ? data.metrics.value.cpuPercent : undefined} message={data.metrics.message} />
          <MetricCard icon={MemoryStick} label="Memory" value={data.metrics.available ? `${formatBytes(data.metrics.value.memoryUsageBytes)} / ${formatBytes(data.metrics.value.memoryLimitBytes)}` : "Unavailable"} percent={data.metrics.available && data.metrics.value.memoryLimitBytes ? data.metrics.value.memoryUsageBytes / data.metrics.value.memoryLimitBytes * 100 : undefined} message={data.metrics.message} />
          <MetricCard icon={HardDrive} label="Disk" value={data.disk.available ? `${formatBytes(data.disk.value.usedBytes)} / ${formatBytes(data.disk.value.totalBytes)}` : "Unavailable"} percent={data.disk.available && data.disk.value.totalBytes ? data.disk.value.usedBytes / data.disk.value.totalBytes * 100 : undefined} message={data.disk.message} />
          <Card className="metric-card">
            <div className="metric-card__icon"><Database aria-hidden="true" /></div>
            <p>Last successful backup</p>
            <strong>{formatDate(data.lastSuccessfulBackup?.createdAt)}</strong>
            <span>{data.lastSuccessfulBackup ? formatBytes(data.lastSuccessfulBackup.sizeBytes) : "No backup has completed yet."}</span>
          </Card>
        </div>
      </section>
      <section className="warnings-section" aria-labelledby="warnings-heading">
        <div className="section-heading"><div><p className="eyebrow">Recent signals</p><h2 id="warnings-heading">Console warnings</h2></div><Activity aria-hidden="true" /></div>
        <Card>
          {data.recentWarnings.length === 0 ? <p className="quiet-row">No recent warnings are present in the bounded console buffer.</p> : (
            <ol className="warning-list">
              {data.recentWarnings.map((line) => <li key={line.sequence}><TriangleAlert aria-hidden="true" /><code>{line.text}</code></li>)}
            </ol>
          )}
        </Card>
      </section>
      <ConfirmDialog
        open={pendingAction !== null}
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={confirmation.label}
        dangerous={pendingAction === "stop"}
        busy={backup.isPending || serverAction.isPending}
        onClose={() => setPendingAction(null)}
        onConfirm={runPending}
      />
    </>
  );
}

function stateTone(state: ServerState): "good" | "warn" | "bad" | "neutral" {
  if (state === "online") return "good";
  if (state === "starting" || state === "stopping") return "warn";
  if (state === "offline") return "bad";
  return "neutral";
}
