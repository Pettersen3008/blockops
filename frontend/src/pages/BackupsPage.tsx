import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, History, RotateCcw, Trash2 } from "lucide-react";
import { api, errorMessage } from "../api";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingState, Notice, PageHeader, StatusPill } from "../components/ui";
import { formatBytes, formatDate } from "../formatters";
import type { Backup, Session } from "../types";
import { hasPermission } from "../types";

type BackupIntent = { type: "create" } | { type: "delete" | "restore"; backup: Backup } | null;

export function BackupsPage({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<BackupIntent>(null);
  const backups = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const mutation = useMutation({
    mutationFn: async (next: NonNullable<BackupIntent>) => {
      if (next.type === "create") return api.createBackup(session.csrfToken);
      if (next.type === "delete") return api.deleteBackup(session.csrfToken, next.backup.id);
      return api.restoreBackup(session.csrfToken, next.backup.id);
    },
    onSuccess: () => {
      setIntent(null);
      void queryClient.invalidateQueries({ queryKey: ["backups"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const canCreate = hasPermission(session.user.role, "backups.create");
  const canDelete = hasPermission(session.user.role, "backups.delete");
  const canRestore = hasPermission(session.user.role, "backups.restore");
  const canDownload = hasPermission(session.user.role, "backups.download");

  if (backups.isLoading) return <LoadingState label="Loading local backup catalog" />;
  if (backups.isError) return <ErrorState message={errorMessage(backups.error)} onRetry={() => void backups.refetch()} />;
  return (
    <>
      <PageHeader eyebrow="Local recovery points" title="Backups" description="Consistent archives on the configured local backup volume. Remote providers remain on the roadmap." actions={canCreate ? <Button onClick={() => setIntent({ type: "create" })}><Archive aria-hidden="true" /> Create backup</Button> : undefined} />
      {mutation.isError ? <Notice tone="danger">{errorMessage(mutation.error)}</Notice> : null}
      {(backups.data?.backups.length ?? 0) === 0 ? <EmptyState title="No backups yet" description="Create the first consistent recovery point when RCON and the world volume are available." action={canCreate ? <Button onClick={() => setIntent({ type: "create" })}>Create first backup</Button> : undefined} /> : (
        <div className="backup-list">
          {backups.data?.backups.map((backup) => (
            <Card className="backup-row" key={backup.id}>
              <div className="backup-row__icon"><Archive aria-hidden="true" /></div>
              <div className="backup-row__identity"><div><h2>{formatDate(backup.createdAt)}</h2><StatusPill tone="good">{backup.status}</StatusPill></div><p>Created by {backup.createdBy} · {formatBytes(backup.sizeBytes)}</p><code>{backup.id}</code></div>
              <div className="backup-row__actions">
                {canDownload ? <a className="button button--secondary" href={`/api/v1/backups/${encodeURIComponent(backup.id)}/download`}><Download aria-hidden="true" />Download</a> : null}
                {canRestore ? <Button variant="secondary" onClick={() => setIntent({ type: "restore", backup })}><RotateCcw aria-hidden="true" />Restore</Button> : null}
                {canDelete ? <Button variant="danger" onClick={() => setIntent({ type: "delete", backup })}><Trash2 aria-hidden="true" />Delete</Button> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card className="retention-note"><History aria-hidden="true" /><div><h2>Manual retention</h2><p>The MVP never deletes backups automatically. Review free space and remove recovery points intentionally.</p></div></Card>
      <ConfirmDialog open={intent !== null} title={intentCopy(intent).title} description={intentCopy(intent).description} confirmLabel={intentCopy(intent).label} dangerous={intent?.type === "delete" || intent?.type === "restore"} busy={mutation.isPending} onClose={() => setIntent(null)} onConfirm={() => intent && mutation.mutate(intent)} />
    </>
  );
}

function intentCopy(intent: BackupIntent) {
  if (intent?.type === "delete") return { title: "Delete this backup?", description: "The local archive and its catalog record will be permanently removed. This cannot be undone.", label: "Delete backup" };
  if (intent?.type === "restore") return { title: "Restore this backup?", description: "BlockOps will stop the server, replace current world directories with this recovery point, and restart. The prior world is kept for rollback until installation succeeds.", label: "Restore backup" };
  return { title: "Create a consistent backup?", description: "World saves will be disabled briefly while BlockOps flushes and archives the configured worlds.", label: "Create backup" };
}
