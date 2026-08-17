import { PlayersPage } from "@/features/players";
import { PermissionBoundary } from "../PermissionBoundary";
import { useRouteSession } from "../useRouteSession";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="players.read" title="Players">
      <PlayersPage session={session} />
    </PermissionBoundary>
  );
}
