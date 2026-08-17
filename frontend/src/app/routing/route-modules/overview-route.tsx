import { OverviewPage } from "@/features/overview";
import { PermissionBoundary } from "../permission-boundary";
import { useRouteSession } from "../use-route-session";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="monitor.read" title="Overview">
      <OverviewPage session={session} />
    </PermissionBoundary>
  );
}
