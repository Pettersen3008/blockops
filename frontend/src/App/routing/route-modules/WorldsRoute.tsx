import { WorldsPage } from "@/features/worlds";
import { PermissionBoundary } from "../PermissionBoundary";
import { useRouteSession } from "../useRouteSession";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="world.download" title="Worlds">
      <WorldsPage session={session} />
    </PermissionBoundary>
  );
}
