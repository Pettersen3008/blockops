import { useState } from "react";
import { Archive, History } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@blockops/ui";
import { safeErrorMessage } from "@/lib/api/api-error";
import { BackupActionDialog } from "./components/backup-action-dialog";
import type { BackupIntent } from "./components/backup-action-dialog";
import { BackupRow } from "./components/backup-row";
import { useBackups } from "./hooks/use-backups";
import { useCreateBackup } from "./hooks/use-create-backup";
import { useDeleteBackup } from "./hooks/use-delete-backup";
import { useRestoreBackup } from "./hooks/use-restore-backup";

export function BackupsPage({ session }: { session: Session }) {
  const [intent, setIntent] = useState<BackupIntent | null>(null);
  const backups = useBackups();
  const create = useCreateBackup();
  const remove = useDeleteBackup();
  const restore = useRestoreBackup();
  const canCreate = hasPermission(session.user.role, "backups.create");
  const canDelete = hasPermission(session.user.role, "backups.delete");
  const canRestore = hasPermission(session.user.role, "backups.restore");
  const canDownload = hasPermission(session.user.role, "backups.download");
  const busy = create.isPending || remove.isPending || restore.isPending;

  const closeDialog = () => {
    if (intent?.type === "create") create.reset();
    if (intent?.type === "delete") remove.reset();
    if (intent?.type === "restore") restore.reset();
    setIntent(null);
  };

  const runIntent = () => {
    if (intent?.type === "create") create.mutate(undefined, { onSuccess: closeDialog });
    if (intent?.type === "delete") remove.mutate(intent.id, { onSuccess: closeDialog });
    if (intent?.type === "restore") restore.mutate(intent.id, { onSuccess: closeDialog });
  };

  const mutationError = intent?.type === "create"
    ? create.error
    : intent?.type === "delete"
      ? remove.error
      : intent?.type === "restore"
        ? restore.error
        : null;

  if (backups.isLoading) return <LoadingState label="Loading local backup catalog" />;
  if (backups.isError || !backups.data) {
    return <ErrorState message={safeErrorMessage(backups.error)} onRetry={() => void backups.refetch()} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Local recovery points"
        title="Backups"
        description="Consistent archives on the configured local backup volume. Remote providers remain on the roadmap."
        actions={canCreate ? <Button onClick={() => setIntent({ type: "create" })}><Archive aria-hidden="true" /> Create backup</Button> : undefined}
      />
      {backups.data.backups.length === 0 ? (
        <EmptyState
          title="No backups yet"
          description="Create the first consistent recovery point when RCON and the world volume are available."
          action={canCreate ? <Button onClick={() => setIntent({ type: "create" })}>Create first backup</Button> : undefined}
        />
      ) : (
        <ul className="grid min-w-0 list-none gap-2.5 p-0" aria-label="Local backup catalog">
          {backups.data.backups.map((backup) => (
            <BackupRow
              key={backup.id}
              backup={backup}
              canDelete={canDelete}
              canDownload={canDownload}
              canRestore={canRestore}
              onDelete={() => setIntent({ type: "delete", id: backup.id })}
              onRestore={() => setIntent({ type: "restore", id: backup.id })}
            />
          ))}
        </ul>
      )}
      <Card className="mt-[18px] flex min-w-0 items-start gap-[13px] p-[18px] text-muted-foreground">
        <History className="w-[21px] shrink-0 text-primary-hover" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="mb-1 text-foreground">Manual retention</h2>
          <p>The MVP never deletes backups automatically. Review free space and remove recovery points intentionally.</p>
        </div>
      </Card>
      {intent ? (
        <BackupActionDialog
          intent={intent}
          busy={busy}
          error={mutationError}
          onClose={closeDialog}
          onConfirm={runIntent}
        />
      ) : null}
    </>
  );
}
