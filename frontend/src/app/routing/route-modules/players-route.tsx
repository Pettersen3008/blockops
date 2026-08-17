import { PlayersPage } from "@/features/players";
import { PermissionBoundary } from "../permission-boundary";
import { useRouteSession } from "../use-route-session";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="players.read" title="Players">
      <PlayersPage session={session} />
    </PermissionBoundary>
  );
}
