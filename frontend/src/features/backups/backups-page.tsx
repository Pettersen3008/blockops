import { useState } from "react";
import { Archive, Download, History, RotateCcw, Trash2 } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { ConfirmDialog } from "@/components/common/action-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/async-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils";
import { backupDownloadUrl } from "./backups-api";
import { useBackups, useCreateBackup, useDeleteBackup, useRestoreBackup } from "./backups-hooks";
import type { Backup } from "./backup-schemas";

type BackupIntent = { type: "create" } | { type: "delete" | "restore"; backup: Backup } | null;

export function BackupsPage({ session }: { session: Session }) {
  const [intent, setIntent] = useState<BackupIntent>(null);
  const backups = useBackups();
  const callbacks = { onSuccess: () => setIntent(null) };
  const create = useCreateBackup(session.csrfToken, callbacks);
  const remove = useDeleteBackup(session.csrfToken, callbacks);
  const restore = useRestoreBackup(session.csrfToken, callbacks);
  const canCreate = hasPermission(session.user.role, "backups.create");
  const canDelete = hasPermission(session.user.role, "backups.delete");
  const canRestore = hasPermission(session.user.role, "backups.restore");
  const canDownload = hasPermission(session.user.role, "backups.download");
  const mutationError = create.error ?? remove.error ?? restore.error;
  const busy = create.isPending || remove.isPending || restore.isPending;

  const runIntent = () => {
    if (intent?.type === "create") create.mutate();
    if (intent?.type === "delete") remove.mutate(intent.backup.id);
    if (intent?.type === "restore") restore.mutate(intent.backup.id);
  };

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
      {mutationError ? <Notice tone="danger">{safeErrorMessage(mutationError)}</Notice> : null}
      {backups.data.backups.length === 0 ? (
        <EmptyState
          title="No backups yet"
          description="Create the first consistent recovery point when RCON and the world volume are available."
          action={canCreate ? <Button onClick={() => setIntent({ type: "create" })}>Create first backup</Button> : undefined}
        />
      ) : (
        <div className="backup-list">
          {backups.data.backups.map((backup) => (
            <Card className="backup-row" key={backup.id}>
              <div className="backup-row__icon"><Archive aria-hidden="true" /></div>
              <div className="backup-row__identity">
                <div><h2>{formatDate(backup.createdAt)}</h2><StatusPill tone="good">{backup.status}</StatusPill></div>
                <p>Created by {backup.createdBy} · {formatBytes(backup.sizeBytes)}</p>
                <code>{backup.id}</code>
              </div>
              <div className="backup-row__actions">
                {canDownload ? <a className={cn(buttonVariants({ variant: "secondary" }))} href={backupDownloadUrl(backup.id)}><Download aria-hidden="true" />Download</a> : null}
                {canRestore ? <Button variant="secondary" onClick={() => setIntent({ type: "restore", backup })}><RotateCcw aria-hidden="true" />Restore</Button> : null}
                {canDelete ? <Button variant="destructive" onClick={() => setIntent({ type: "delete", backup })}><Trash2 aria-hidden="true" />Delete</Button> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card className="retention-note"><History aria-hidden="true" /><div><h2>Manual retention</h2><p>The MVP never deletes backups automatically. Review free space and remove recovery points intentionally.</p></div></Card>
      <ConfirmDialog
        open={intent !== null}
        title={intentCopy(intent).title}
        description={intentCopy(intent).description}
        confirmLabel={intentCopy(intent).label}
        dangerous={intent?.type === "delete" || intent?.type === "restore"}
        busy={busy}
        onClose={() => setIntent(null)}
        onConfirm={runIntent}
      />
    </>
  );
}

function intentCopy(intent: BackupIntent) {
  if (intent?.type === "delete") return { title: "Delete this backup?", description: "The local archive and its catalog record will be permanently removed. This cannot be undone.", label: "Delete backup" };
  if (intent?.type === "restore") return { title: "Restore this backup?", description: "BlockOps will stop the server, replace current world directories with this recovery point, and restart. The prior world is kept for rollback until installation succeeds.", label: "Restore backup" };
  return { title: "Create a consistent backup?", description: "World saves will be disabled briefly while BlockOps flushes and archives the configured worlds.", label: "Create backup" };
}
