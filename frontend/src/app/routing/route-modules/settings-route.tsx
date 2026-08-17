import { SettingsPage } from "@/features/settings";
import { PermissionBoundary } from "../permission-boundary";
import { useRouteSession } from "../use-route-session";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="settings.manage" title="Settings">
      <SettingsPage session={session} />
    </PermissionBoundary>
  );
}
