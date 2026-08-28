import { ConfirmDialog } from "@blockops/ui";
import { confirmationFor, type OverviewAction } from "../overview-actions";

export function OverviewConfirmation({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: OverviewAction | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy = confirmationFor(action);

  return (
    <ConfirmDialog
      open={action !== null}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.label}
      dangerous={action === "stop"}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
