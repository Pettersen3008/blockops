import type { FormEvent, ReactNode } from "react";

import { Button } from "./button";
import { Modal, ModalActions } from "./modal";

/**
 * The one way BlockOps asks "are you sure". `dangerous` is the only lever on the confirm
 * button's styling, so a destructive action can never be dressed up as a safe one.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  dangerous = false,
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  dangerous?: boolean;
  busy?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        {error}
        <ModalActions>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant={dangerous ? "destructive" : "default"} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
