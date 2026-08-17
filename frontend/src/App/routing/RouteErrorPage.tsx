import { AlertTriangle } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";

export function RouteErrorPage() {
  useRouteError();
  return (
    <main className="full-screen-state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h1>This page couldn’t be loaded</h1>
      <p>The route failed before BlockOps could display it.</p>
      <Link className="button button--primary" to="/overview">Return to overview</Link>
    </main>
  );
}
