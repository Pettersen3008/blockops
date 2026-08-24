import type { ReactNode } from "react";
import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center gap-2 text-center text-muted-foreground" role="status">
      <LoaderCircle className="size-[30px] animate-spin text-primary-hover" aria-hidden="true" />
      <p className="m-0">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <Inbox className="size-[30px] text-primary-hover" aria-hidden="true" />
      <h2 className="mt-[7px] mb-0 text-foreground">{title}</h2>
      <p className="mb-2.5 max-w-[480px]">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center gap-2 text-center text-muted-foreground" role="alert">
      <AlertTriangle className="size-[30px] text-destructive" aria-hidden="true" />
      <h2 className="mt-[7px] mb-0 text-foreground">Couldn’t load this view</h2>
      <p className="mb-2.5 max-w-[480px]">{message}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
