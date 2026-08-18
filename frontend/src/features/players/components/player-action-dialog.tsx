import { type FormEvent, useId, useState } from "react";
import { Modal } from "@/components/common/action-dialog";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeErrorMessage } from "@/lib/api/api-error";
import { playerActionCopy } from "../player-action-copy";
import { MAX_REASON_BYTES, playerActionRequestSchema } from "../player-schema";
import type { PendingPlayerAction, PlayerActionRequest } from "../player-schema";

/**
 * Confirms one pending action. The caller renders this only while an action is pending,
 * so unmounting is what resets the reason field between actions.
 *
 * This is the only place a failed action is reported. The page deliberately does not
 * also render the mutation error, or a single failure shows up twice.
 */
export function PlayerActionDialog({
  pending,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  pending: PendingPlayerAction;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (request: PlayerActionRequest) => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonId = useId();
  const reasonErrorId = `${reasonId}-error`;
  const copy = playerActionCopy[pending.action];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = playerActionRequestSchema.safeParse({
      action: pending.action,
      name: pending.name,
      reason: copy.needsReason ? reason : "",
    });
    if (!parsed.success) {
      // Only a reason problem belongs in the reason field's hint. A name that fails here
      // is a caller bug the operator cannot fix from this input.
      const reasonIssue = parsed.error.issues.find((issue) => issue.path[0] === "reason");
      setReasonError(reasonIssue?.message ?? "The player action is invalid.");
      return;
    }
    setReasonError(null);
    onConfirm(parsed.data);
  };

  return (
    <Modal open title={copy.title(pending.name)} description={copy.description} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {copy.needsReason ? (
          <Field label="Reason" htmlFor={reasonId} hint={reasonError ?? undefined} hintId={reasonErrorId} hintIsError={Boolean(reasonError)}>
            <Input
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={reasonError ? reasonErrorId : undefined}
              aria-invalid={Boolean(reasonError)}
              // Coarse browser guard only: maxLength counts UTF-16 units while the schema
              // counts UTF-8 bytes, and a byte count is always at least a unit count, so
              // this can only ever be permissive. Zod owns the real limit.
              maxLength={MAX_REASON_BYTES}
              placeholder="Shown to the player"
              required
            />
          </Field>
        ) : null}
        {error ? <Notice tone="danger">{safeErrorMessage(error)}</Notice> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={copy.dangerous ? "destructive" : "default"} disabled={busy}>{busy ? "Working…" : copy.confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
