import { type FormEvent, useState } from "react";
import { Modal } from "@/components/common/ActionDialog";
import { Field } from "@/components/common/Field";
import { Notice } from "@/components/common/Notice";
import { Button } from "@/components/ui/button";
import { safeErrorMessage } from "@/lib/api/ApiError";
import { actionDetails } from "../player.actions";
import { playerActionRequestSchema } from "../player.schemas";
import type { PendingPlayerAction, PlayerActionRequest } from "../player.schemas";

export function PlayerActionDialog({
  pending,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  pending: PendingPlayerAction | null;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (request: PlayerActionRequest) => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  if (!pending) return null;
  const copy = actionDetails(pending.action, pending.name);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = playerActionRequestSchema.safeParse({
      ...pending,
      reason: copy.needsReason ? reason : "",
    });
    if (!parsed.success) {
      setReasonError(parsed.error.flatten().fieldErrors.reason?.[0] ?? "The player action is invalid.");
      return;
    }
    setReasonError(null);
    onConfirm(parsed.data);
  };

  return (
    <Modal open title={copy.title} description={copy.description} onClose={onClose}>
      <form onSubmit={submit} className="stack-form" noValidate>
        {copy.needsReason ? (
          <Field label="Reason (optional)" htmlFor="player-action-reason" hint={reasonError ?? undefined} hintId="player-action-reason-error" hintIsError={Boolean(reasonError)}>
            <input
              id="player-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={reasonError ? "player-action-reason-error" : undefined}
              aria-invalid={Boolean(reasonError)}
              maxLength={160}
              placeholder="Shown to the player"
            />
          </Field>
        ) : null}
        {error ? <Notice tone="danger">{safeErrorMessage(error)}</Notice> : null}
        <div className="modal__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={copy.dangerous ? "destructive" : "default"} disabled={busy}>{busy ? "Working…" : copy.label}</Button>
        </div>
      </form>
    </Modal>
  );
}
