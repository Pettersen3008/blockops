import { SettingsPage } from "@/pages/SettingsPage";
import { PermissionBoundary } from "../PermissionBoundary";
import { useRouteSession } from "../useRouteSession";

export function Component() {
  const session = useRouteSession();
  return (
    <PermissionBoundary permission="settings.manage" title="Settings">
      <SettingsPage session={session} />
    </PermissionBoundary>
  );
}
