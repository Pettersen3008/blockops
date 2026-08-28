import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { PropsWithChildren } from "react";

import { Button } from "./button";

/**
 * A centred, titled overlay. Base UI owns focus trapping, focus restore, escape,
 * and scroll locking; BlockOps owns the frame, the header, and the close affordance.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
}>) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-slot="modal-backdrop"
          className="fixed inset-0 isolate z-50 bg-[rgba(8,12,9,0.65)] duration-100 supports-backdrop-filter:backdrop-blur-[3px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <Dialog.Popup
          data-slot="modal"
          className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-40px)] w-[min(520px,calc(100vw-32px))] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] bg-popover p-6 text-sm text-popover-foreground shadow-[var(--shadow)] duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="mb-[22px] flex flex-row items-start justify-between gap-5">
            <div>
              <Dialog.Title className="mb-1.5 text-[1.35rem] leading-none font-medium">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-[42px] min-w-[42px] p-0"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The row that ends a modal: cancel first in the DOM, confirm last, reversed on narrow screens. */
export function ModalActions({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
  );
}
