import { PageHeader, ErrorState, LoadingState } from "@/components/ui";
import type { Session } from "@/features/auth";
import { safeErrorMessage } from "@/lib/api/ApiError";
import { DeploymentSettings } from "./components/DeploymentSettings";
import { IntegrationSettings } from "./components/IntegrationSettings";
import { UserSettings } from "./components/UserSettings";
import { useSettings, useUsers } from "./settings.hooks";

export function SettingsPage({ session }: { session: Session }) {
  const settings = useSettings();
  const users = useUsers();

  if (settings.isLoading || users.isLoading) return <LoadingState label="Loading protected settings" />;
  if (settings.isError) return <ErrorState message={safeErrorMessage(settings.error)} onRetry={() => void settings.refetch()} />;
  if (users.isError) return <ErrorState message={safeErrorMessage(users.error)} onRetry={() => void users.refetch()} />;
  if (!settings.data || !users.data) return null;

  return (
    <>
      <PageHeader eyebrow="Administrator controls" title="Settings" description="Dashboard users, revocable sessions, encrypted RCON credentials, and immutable deployment boundaries." />
      <div className="settings-stack">
        <IntegrationSettings session={session} status={settings.data.rcon} />
        <UserSettings session={session} users={users.data.users} />
        <DeploymentSettings settings={settings.data.deployment} />
      </div>
    </>
  );
}
