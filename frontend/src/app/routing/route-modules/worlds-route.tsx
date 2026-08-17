import { WorldsPage } from "@/features/worlds";
import { PermissionBoundary } from "../permission-boundary";
import { useRouteSession } from "../use-route-session";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="world.download" title="Worlds">
      <WorldsPage session={session} />
    </PermissionBoundary>
  );
}
