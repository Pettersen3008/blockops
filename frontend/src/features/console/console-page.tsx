import { ErrorState, LoadingState } from "@/components/common/async-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { StatusPill } from "@/components/common/status-pill";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { safeErrorMessage } from "@/lib/api/api-error";
import { ConsoleCommandForm } from "./components/console-command-form";
import { ConsoleOutput } from "./components/console-output";
import { useConsoleHistory } from "./hooks/use-console-history";
import { useConsoleStream } from "./hooks/use-console-stream";

export function ConsolePage({ session }: { session: Session }) {
  const history = useConsoleHistory();
  const stream = useConsoleStream();
  const canExecute = hasPermission(session.user.role, "console.execute");

  if (history.isLoading) return <LoadingState label="Loading bounded console history" />;
  if (history.isError) return <ErrorState message={safeErrorMessage(history.error)} onRetry={() => void history.refetch()} />;
  if (!history.data) return <LoadingState label="Loading bounded console history" />;

  return (
    <>
      <PageHeader eyebrow="RCON + latest.log" title="Console" description="A bounded, sanitized Minecraft console. Commands never reach a host shell." actions={<StatusPill tone={stream.connection === "connected" ? "good" : stream.connection === "disconnected" ? "bad" : "warn"}>{stream.connection}</StatusPill>} />
      <ConsoleOutput history={history.data.lines} live={stream.lines} />
      {canExecute ? <ConsoleCommandForm /> : <Notice>Viewer access is read-only. Ask an administrator for the Operator role to submit Minecraft commands.</Notice>}
    </>
  );
}
