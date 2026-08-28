import { AlertTriangle } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "@blockops/ui";

export function RouteErrorPage() {
  useRouteError();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground" role="alert">
      <AlertTriangle className="size-[30px] text-destructive" aria-hidden="true" />
      <h1>This page couldn’t be loaded</h1>
      <p>The route failed before BlockOps could display it.</p>
      <Button render={<Link to="/overview" />}>Return to overview</Button>
    </main>
  );
}
