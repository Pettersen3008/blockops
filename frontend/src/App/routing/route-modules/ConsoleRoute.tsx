import { ConsolePage } from "@/pages/ConsolePage";
import { PermissionBoundary } from "../PermissionBoundary";
import { useRouteSession } from "../useRouteSession";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="console.read" title="Console">
      <ConsolePage session={session} />
    </PermissionBoundary>
  );
}
