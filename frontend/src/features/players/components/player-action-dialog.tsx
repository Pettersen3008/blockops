import { type FormEvent, useState } from "react";
import { Modal } from "@/components/common/action-dialog";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeErrorMessage } from "@/lib/api/api-error";
import { actionDetails } from "../player-action-copy";
import { playerActionRequestSchema } from "../schemas/player-schema";
import type { PendingPlayerAction, PlayerActionRequest } from "../schemas/player-schema";

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
  const needsReason = pending.action === "kick" || pending.action === "ban";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = playerActionRequestSchema.safeParse({
      ...pending,
      reason: needsReason ? reason : "",
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
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {needsReason ? (
          <Field label="Reason" htmlFor="player-action-reason" hint={reasonError ?? undefined} hintId="player-action-reason-error" hintIsError={Boolean(reasonError)}>
            <Input
              id="player-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={reasonError ? "player-action-reason-error" : undefined}
              aria-invalid={Boolean(reasonError)}
              maxLength={160}
              placeholder="Shown to the player"
              required
            />
          </Field>
        ) : null}
        {error ? <Notice tone="danger">{safeErrorMessage(error)}</Notice> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={copy.dangerous ? "destructive" : "default"} disabled={busy}>{busy ? "Working…" : copy.label}</Button>
        </div>
      </form>
    </Modal>
  );
}
