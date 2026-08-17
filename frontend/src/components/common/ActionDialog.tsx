import type { FormEvent, PropsWithChildren } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: PropsWithChildren<{ open: boolean; title: string; description?: string; onClose: () => void }>) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-h-[calc(100vh-40px)] w-[min(520px,calc(100vw-32px))] gap-0 rounded-[18px] border-border p-6 shadow-[var(--shadow)] ring-0 sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader className="modal__header">
          <div>
            <DialogTitle className="mb-1.5 text-[1.35rem]">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
          <Button variant="ghost" size="icon" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  dangerous = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  dangerous?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <form onSubmit={submit} className="modal__actions">
        <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant={dangerous ? "destructive" : "default"} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
      </form>
    </Modal>
  );
}
