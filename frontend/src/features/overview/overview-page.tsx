import { useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { Button, ErrorState, LoadingState, Notice, PageHeader } from "@blockops/ui";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { useCreateBackup } from "@/features/backups";
import { safeErrorMessage } from "@/lib/api/api-error";
import { CapacitySection } from "./components/capacity-section";
import { OverviewConfirmation } from "./components/overview-confirmation";
import { PlayerSummary } from "./components/player-summary";
import { ServerLifecycle } from "./components/server-lifecycle";
import { WarningsSection } from "./components/warnings-section";
import type { OverviewAction } from "./overview-actions";
import { useOverview } from "./hooks/use-overview";
import { useServerAction } from "./hooks/use-server-action";
import type { ServerAction } from "./overview-schema";

export function OverviewPage({ session }: { session: Session }) {
  const [pendingAction, setPendingAction] = useState<OverviewAction | null>(null);
  const overview = useOverview();
  const backup = useCreateBackup();
  const serverAction = useServerAction();
  const canBackup = hasPermission(session.user.role, "backups.create");
  const canRestart = hasPermission(session.user.role, "server.restart");
  const isAdministrator = session.user.role === "administrator";

  const canRunServerAction = (action: ServerAction) => (
    action === "restart" ? canRestart : isAdministrator
  );

  const requestAction = (action: OverviewAction) => {
    if (action === "backup") {
      if (!canBackup) return;
      backup.reset();
    } else {
      if (!canRunServerAction(action)) return;
      serverAction.reset();
    }
    setPendingAction(action);
  };

  const closeConfirmation = () => {
    if (pendingAction === "backup") backup.reset();
    if (pendingAction && pendingAction !== "backup") serverAction.reset();
    setPendingAction(null);
  };

  const confirmAction = () => {
    if (pendingAction === "backup" && canBackup) {
      backup.mutate(undefined, { onSuccess: closeConfirmation });
      return;
    }
    if (pendingAction && pendingAction !== "backup" && canRunServerAction(pendingAction)) {
      serverAction.mutate(pendingAction, { onSuccess: closeConfirmation });
    }
  };

  if (overview.isPending) return <LoadingState label="Reading live server state" />;
  if (overview.isError) {
    return <ErrorState message={safeErrorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  }

  const data = overview.data;
  const mutationError = pendingAction === "backup" ? backup.error : serverAction.error;

  return (
    <>
      <PageHeader
        eyebrow="Server pulse"
        title="Overview"
        description="One honest view of runtime health, players, capacity, and recent operational signals."
        actions={canBackup || canRestart ? (
          <>
            {canBackup ? <Button variant="secondary" onClick={() => requestAction("backup")}><Archive aria-hidden="true" /> Back up now</Button> : null}
            {canRestart ? <Button onClick={() => requestAction("restart")}><RefreshCw aria-hidden="true" /> Graceful restart</Button> : null}
          </>
        ) : undefined}
      />
      {mutationError ? <Notice tone="danger">{safeErrorMessage(mutationError)}</Notice> : null}
      <div className="mb-[34px] grid min-w-0 grid-cols-1 gap-3 min-[901px]:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)] min-[901px]:gap-[18px]">
        <ServerLifecycle
          server={data.server}
          canControl={isAdministrator}
          onAction={requestAction}
        />
        <PlayerSummary players={data.players} />
      </div>
      <CapacitySection data={data} />
      <WarningsSection warnings={data.recentWarnings} />
      <OverviewConfirmation
        action={pendingAction}
        busy={backup.isPending || serverAction.isPending}
        onClose={closeConfirmation}
        onConfirm={confirmAction}
      />
    </>
  );
}
