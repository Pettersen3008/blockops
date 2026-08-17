import { BackupsPage } from "@/pages/BackupsPage";
import { PermissionBoundary } from "../PermissionBoundary";
import { useRouteSession } from "../useRouteSession";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="backups.read" title="Backups">
      <BackupsPage session={session} />
    </PermissionBoundary>
  );
}
