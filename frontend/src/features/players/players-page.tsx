import { useState } from "react";
import { Search } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/async-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { safeErrorMessage } from "@/lib/api/api-error";
import { AllowlistForm } from "./components/allowlist-form";
import { PlayerActionDialog } from "./components/player-action-dialog";
import { PlayerRow } from "./components/player-row";
import { usePlayerAction, usePlayers } from "./hooks/use-players";
import { playerNameSchema } from "./schemas/player-schema";
import type { PendingPlayerAction, PlayerActionRequest } from "./schemas/player-schema";

export function PlayersPage({ session }: { session: Session }) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPlayerAction | null>(null);
  const players = usePlayers();
  const action = usePlayerAction(() => {
    setPending(null);
    setNewName("");
    setNewNameError(null);
  });
  const canManage = hasPermission(session.user.role, "players.manage");
  const normalizedSearch = search.toLowerCase();
  const filtered = (players.data?.players ?? []).filter((player) => (
    player.name.toLowerCase().includes(normalizedSearch)
  ));

  const addToAllowlist = () => {
    const parsed = playerNameSchema.safeParse(newName);
    if (!parsed.success) {
      setNewNameError(parsed.error.issues[0]?.message ?? "Use a valid Java username.");
      return;
    }
    setNewNameError(null);
    setPending({ action: "allowlist-add", name: parsed.data });
  };

  if (players.isLoading) return <LoadingState label="Reading players and vanilla access lists" />;
  if (players.isError || !players.data) {
    return <ErrorState message={safeErrorMessage(players.error)} onRetry={() => void players.refetch()} />;
  }

  return (
    <>
      <PageHeader eyebrow="Vanilla access control" title="Players" description="Online presence, identifiers, allowlist, bans, and operator status from the configured Java server." />
      {action.isError ? <Notice tone="danger">{safeErrorMessage(action.error)}</Notice> : null}
      <Card className="mb-4 flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
        <label className="relative block w-full lg:max-w-[430px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search players</span>
          <Input className="h-10 pl-10!" type="search" placeholder="Search known players" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {canManage ? (
          <AllowlistForm
            name={newName}
            error={newNameError}
            onNameChange={setNewName}
            onSubmit={addToAllowlist}
          />
        ) : <p className="text-sm text-muted-foreground">Viewer access is read-only.</p>}
      </Card>
      {filtered.length === 0 ? (
        <EmptyState title="No players found" description={search ? "No known player matches this search." : "Player records appear after the server has seen a player."} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableCaption className="sr-only">Known Minecraft players and access controls</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Access</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((player) => (
                <PlayerRow
                  key={player.uuid || player.name}
                  player={player}
                  canManage={canManage}
                  onAction={setPending}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <PlayerActionDialog
        key={pending ? `${pending.action}:${pending.name}` : "closed"}
        pending={pending}
        busy={action.isPending}
        error={action.error}
        onClose={() => setPending(null)}
        onConfirm={(request: PlayerActionRequest) => action.mutate(request)}
      />
    </>
  );
}
