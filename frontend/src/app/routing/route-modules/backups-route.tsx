import { BackupsPage } from "@/features/backups";
import { PermissionBoundary } from "../permission-boundary";
import { useRouteSession } from "../use-route-session";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="backups.read" title="Backups">
      <BackupsPage session={session} />
    </PermissionBoundary>
  );
}
