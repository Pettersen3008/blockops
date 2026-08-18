import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/async-state";
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
import { usePlayerAction } from "./hooks/use-player-action";
import { usePlayers } from "./hooks/use-players";
import type { PendingPlayerAction, PlayerActionRequest } from "./player-schema";

/**
 * Which surface asked for the action. A successful action resets the surface that started
 * it and nothing else, so this has to be carried rather than inferred: comparing the
 * submitted name to the allowlist draft happens to work, but it reads like a coincidence.
 */
type PendingAction = PendingPlayerAction & { origin: "player-row" | "allowlist-form" };

export function PlayersPage({ session }: { session: Session }) {
  const [search, setSearch] = useState("");
  const [allowlistDraft, setAllowlistDraft] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const players = usePlayers();
  const action = usePlayerAction();
  // Closing is the only moment a failed attempt can be forgotten, and the dialog is
  // modal, so no other action can start while one is on screen. Without reset() a
  // failed ban on Alex still renders when the dialog reopens for Steve.
  const closeDialog = () => {
    setPending(null);
    action.reset();
  };
  // Wrapped only so PlayerRow keeps a referentially stable prop; the deps are empty by
  // construction. An inline arrow here silently turns 0 row renders per keystroke into one
  // per visible row. See the memo comment in player-row.tsx.
  const requestFromRow = useCallback(
    (next: PendingPlayerAction) => setPending({ ...next, origin: "player-row" }),
    [],
  );
  const confirm = (request: PlayerActionRequest) => {
    action.mutate(request, {
      onSuccess: () => {
        closeDialog();
        // Only the surface that started this action is reset. A kick must never discard a
        // name typed into the allowlist form.
        if (pending?.origin === "allowlist-form") setAllowlistDraft("");
      },
    });
  };
  const canManage = hasPermission(session.user.role, "players.manage");
  const normalizedSearch = search.toLowerCase();
  const filtered = (players.data?.players ?? []).filter((player) => (
    player.name.toLowerCase().includes(normalizedSearch)
  ));

  if (players.isLoading) return <LoadingState label="Reading players and vanilla access lists" />;
  if (players.isError || !players.data) {
    return <ErrorState message={safeErrorMessage(players.error)} onRetry={() => void players.refetch()} />;
  }

  return (
    <>
      <PageHeader eyebrow="Vanilla access control" title="Players" description="Online presence, identifiers, allowlist, bans, and operator status from the configured Java server." />
      <Card className="mb-4 flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
        <label className="relative block w-full lg:max-w-[430px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search players</span>
          <Input className="h-10 pl-10!" type="search" placeholder="Search known players" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {canManage ? (
          <AllowlistForm
            name={allowlistDraft}
            onNameChange={setAllowlistDraft}
            onSubmit={(validName) => setPending({ action: "allowlist-add", name: validName, origin: "allowlist-form" })}
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
                  onAction={requestFromRow}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {pending ? (
        <PlayerActionDialog
          pending={pending}
          busy={action.isPending}
          error={action.error}
          onClose={closeDialog}
          onConfirm={confirm}
        />
      ) : null}
    </>
  );
}
