import { type FormEvent, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/async-state";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { safeErrorMessage } from "@/lib/api/api-error";
import { PlayerActionDialog } from "./components/player-action-dialog";
import { PlayerCard } from "./components/player-card";
import { usePlayerAction, usePlayers } from "./players-hooks";
import { playerNameSchema } from "./player-schemas";
import type { PendingPlayerAction, PlayerActionRequest } from "./player-schemas";

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
  const filtered = (players.data?.players ?? []).filter((player) => (
    player.name.toLowerCase().includes(search.toLowerCase())
  ));

  const addToAllowlist = (event: FormEvent) => {
    event.preventDefault();
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
      <Card className="players-tools">
        <label className="search-input"><Search aria-hidden="true" /><span className="sr-only">Search players</span><input type="search" placeholder="Search known players" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {canManage ? (
          <form onSubmit={addToAllowlist} className="allowlist-form" noValidate>
            <Field label="Add to allowlist" htmlFor="allowlist-name" hint={newNameError ?? undefined} hintId="allowlist-name-error" hintIsError={Boolean(newNameError)}>
              <input id="allowlist-name" placeholder="Java username" aria-describedby={newNameError ? "allowlist-name-error" : undefined} aria-invalid={Boolean(newNameError)} maxLength={16} value={newName} onChange={(event) => setNewName(event.target.value)} />
            </Field>
            <Button type="submit"><UserPlus aria-hidden="true" /> Add</Button>
          </form>
        ) : <p className="muted">Viewer access is read-only.</p>}
      </Card>
      {filtered.length === 0 ? (
        <EmptyState title="No players found" description={search ? "No known player matches this search." : "Player records appear after the server has seen a player."} />
      ) : (
        <div className="player-list">
          {filtered.map((player) => (
            <PlayerCard
              key={player.uuid || player.name}
              player={player}
              canManage={canManage}
              onAction={(next) => setPending({ action: next, name: player.name })}
            />
          ))}
        </div>
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
