import { ErrorState, LoadingState, PageHeader } from "@blockops/ui";
import type { Session } from "@/features/auth";
import { safeErrorMessage } from "@/lib/api/api-error";
import { DeploymentSettings } from "./components/deployment-settings";
import { IntegrationSettings } from "./components/integration-settings";
import { UserSettings } from "./components/user-settings";
import { useSettings } from "./hooks/use-settings";
import { useUsers } from "./hooks/use-users";

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
      <div className="grid gap-[18px]">
        <IntegrationSettings status={settings.data.rcon} />
        <UserSettings session={session} users={users.data.users} />
        <DeploymentSettings settings={settings.data.deployment} />
      </div>
    </>
  );
}
