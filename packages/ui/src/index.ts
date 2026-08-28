// The BlockOps design system. Base UI owns interaction behaviour; this package owns the
// component API, the variants, and the visual language. Nothing product-specific lives here.

export { cn } from "./cn";

// Primitives
export { Avatar, AvatarFallback } from "./avatar";
export { Badge } from "./badge";
export { Button } from "./button";
export { Card } from "./card";
export { Input } from "./input";
export { Label } from "./label";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

// Patterns
export { EmptyState, ErrorState, LoadingState } from "./async-state";
export { ConfirmDialog } from "./confirm-dialog";
export { Field } from "./field";
export { Modal, ModalActions } from "./modal";
export { Notice, type NoticeTone } from "./notice";
export { PageHeader } from "./page-header";
export { StatusPill, type StatusTone } from "./status-pill";
