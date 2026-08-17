import { ConsolePage } from "@/features/console";
import { PermissionBoundary } from "../permission-boundary";
import { useRouteSession } from "../use-route-session";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="console.read" title="Console">
      <ConsolePage session={session} />
    </PermissionBoundary>
  );
}
