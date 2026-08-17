import { OverviewPage } from "@/pages/OverviewPage";
import { PermissionBoundary } from "../PermissionBoundary";
import { useRouteSession } from "../useRouteSession";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="monitor.read" title="Overview">
      <OverviewPage session={session} />
    </PermissionBoundary>
  );
}
