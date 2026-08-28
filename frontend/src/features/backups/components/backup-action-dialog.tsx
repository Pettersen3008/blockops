import type { FormEvent } from "react";
import { Button, Modal, ModalActions, Notice } from "@blockops/ui";
import { safeErrorMessage } from "@/lib/api/api-error";

export type BackupIntent =
  | { type: "create" }
  | { type: "delete" | "restore"; id: string };

const copy = {
  create: {
    title: "Create a consistent backup?",
    description: "World saves will be disabled briefly while BlockOps flushes and archives the configured worlds.",
    label: "Create backup",
  },
  delete: {
    title: "Delete this backup?",
    description: "The local archive and its catalog record will be permanently removed. This cannot be undone.",
    label: "Delete backup",
  },
  restore: {
    title: "Restore this backup?",
    description: "BlockOps will stop the server, replace current world directories with this recovery point, and restart. The prior world is kept for rollback until installation succeeds.",
    label: "Restore backup",
  },
} as const;

export function BackupActionDialog({
  intent,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  intent: BackupIntent;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const intentCopy = copy[intent.type];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <Modal open title={intentCopy.title} description={intentCopy.description} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        {error ? <Notice tone="danger">{safeErrorMessage(error)}</Notice> : null}
        <ModalActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={intent.type === "create" ? "default" : "destructive"} disabled={busy}>
            {busy ? "Working…" : intentCopy.label}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
