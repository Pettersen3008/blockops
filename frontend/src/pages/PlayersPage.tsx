import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Crown, Search, ShieldCheck, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { api, errorMessage } from "../api";
import { Button, Card, EmptyState, ErrorState, Field, LoadingState, Modal, Notice, PageHeader, StatusPill } from "../components/ui";
import type { Player, Session } from "../types";
import { hasPermission } from "../types";

type PlayerAction = "allowlist-add" | "allowlist-remove" | "kick" | "ban" | "pardon" | "op" | "deop";

interface PendingPlayerAction {
  action: PlayerAction;
  name: string;
}

export function PlayersPage({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState<PendingPlayerAction | null>(null);
  const players = useQuery({ queryKey: ["players"], queryFn: api.players, refetchInterval: 15_000 });
  const action = useMutation({
    mutationFn: ({ action, name, reason }: PendingPlayerAction & { reason: string }) => api.playerAction(session.csrfToken, action, name, reason),
    onSuccess: () => {
      setPending(null);
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["players"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const canManage = hasPermission(session.user.role, "players.manage");
  const filtered = useMemo(() => (players.data?.players ?? []).filter((player) => player.name.toLowerCase().includes(search.toLowerCase())), [players.data?.players, search]);

  if (players.isLoading) return <LoadingState label="Reading players and vanilla access lists" />;
  if (players.isError) return <ErrorState message={errorMessage(players.error)} onRetry={() => void players.refetch()} />;

  return (
    <>
      <PageHeader eyebrow="Vanilla access control" title="Players" description="Online presence, identifiers, allowlist, bans, and operator status from the configured Java server." />
      {action.isError ? <Notice tone="danger">{errorMessage(action.error)}</Notice> : null}
      <Card className="players-tools">
        <label className="search-input"><Search aria-hidden="true" /><span className="sr-only">Search players</span><input type="search" placeholder="Search known players" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {canManage ? (
          <form onSubmit={(event) => { event.preventDefault(); if (newName) setPending({ action: "allowlist-add", name: newName }); }} className="allowlist-form">
            <label htmlFor="allowlist-name">Add to allowlist</label>
            <input id="allowlist-name" placeholder="Java username" pattern="[A-Za-z0-9_]{1,16}" maxLength={16} value={newName} onChange={(event) => setNewName(event.target.value)} required />
            <Button type="submit"><UserPlus aria-hidden="true" /> Add</Button>
          </form>
        ) : <p className="muted">Viewer access is read-only.</p>}
      </Card>
      {filtered.length === 0 ? <EmptyState title="No players found" description={search ? "No known player matches this search." : "Player records appear after the server has seen a player."} /> : (
        <div className="player-list">
          {filtered.map((player) => <PlayerCard key={player.uuid || player.name} player={player} canManage={canManage} onAction={(next) => setPending({ action: next, name: player.name })} />)}
        </div>
      )}
      <PlayerActionDialog key={pending ? `${pending.action}:${pending.name}` : "closed"} pending={pending} busy={action.isPending} error={action.error} onClose={() => setPending(null)} onConfirm={(reason) => pending && action.mutate({ ...pending, reason })} />
    </>
  );
}

function PlayerCard({ player, canManage, onAction }: { player: Player; canManage: boolean; onAction: (action: PlayerAction) => void }) {
  return (
    <Card className="player-card">
      <div className="player-avatar" aria-hidden="true">{player.name.slice(0, 2).toUpperCase()}</div>
      <div className="player-card__identity">
        <div><h2>{player.name}</h2><StatusPill tone={player.online ? "good" : "neutral"}>{player.online ? "online" : "offline"}</StatusPill></div>
        <code>{player.uuid || "UUID unavailable"}</code>
        <div className="badge-row">
          {player.allowlisted ? <span><ShieldCheck aria-hidden="true" />Allowlisted</span> : null}
          {player.operator ? <span><Crown aria-hidden="true" />Operator</span> : null}
          {player.banned ? <span className="badge--danger"><Ban aria-hidden="true" />Banned</span> : null}
        </div>
      </div>
      {canManage ? (
        <div className="player-card__actions">
          <Button variant="secondary" onClick={() => onAction(player.allowlisted ? "allowlist-remove" : "allowlist-add")}><ShieldCheck aria-hidden="true" />{player.allowlisted ? "Remove allowlist" : "Allowlist"}</Button>
          <Button variant="secondary" onClick={() => onAction(player.operator ? "deop" : "op")}><Crown aria-hidden="true" />{player.operator ? "De-OP" : "OP"}</Button>
          {player.banned ? <Button variant="secondary" onClick={() => onAction("pardon")}><UsersRound aria-hidden="true" />Pardon</Button> : <Button variant="danger" onClick={() => onAction("ban")}><Ban aria-hidden="true" />Ban</Button>}
          {player.online ? <Button variant="danger" onClick={() => onAction("kick")}><UserMinus aria-hidden="true" />Kick</Button> : null}
        </div>
      ) : null}
    </Card>
  );
}

function PlayerActionDialog({ pending, busy, error, onClose, onConfirm }: { pending: PendingPlayerAction | null; busy: boolean; error: unknown; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  if (!pending) return null;
  const copy = actionCopy(pending.action, pending.name);
  const submit = (event: FormEvent) => { event.preventDefault(); onConfirm(reason); };
  const needsReason = pending.action === "kick" || pending.action === "ban";
  return (
    <Modal open title={copy.title} description={copy.description} onClose={onClose}>
      <form onSubmit={submit} className="stack-form">
        {needsReason ? <Field label="Reason (optional)" htmlFor="player-action-reason"><input id="player-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={160} placeholder="Shown to the player" /></Field> : null}
        {error ? <Notice tone="danger">{errorMessage(error)}</Notice> : null}
        <div className="modal__actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant={copy.dangerous ? "danger" : "primary"} disabled={busy}>{busy ? "Working…" : copy.label}</Button></div>
      </form>
    </Modal>
  );
}

function actionCopy(action: PlayerAction, name: string) {
  switch (action) {
    case "allowlist-add": return { title: `Allowlist ${name}?`, description: "The player will be allowed to join when the server allowlist is enabled.", label: "Add to allowlist", dangerous: false };
    case "allowlist-remove": return { title: `Remove ${name} from the allowlist?`, description: "They may no longer be able to join. This does not disconnect an online player.", label: "Remove", dangerous: true };
    case "kick": return { title: `Kick ${name}?`, description: "The player will be disconnected immediately but can reconnect if otherwise allowed.", label: "Kick player", dangerous: true };
    case "ban": return { title: `Ban ${name}?`, description: "The player will be blocked from joining until pardoned.", label: "Ban player", dangerous: true };
    case "pardon": return { title: `Pardon ${name}?`, description: "The vanilla player ban will be removed.", label: "Pardon player", dangerous: false };
    case "op": return { title: `Grant operator to ${name}?`, description: "Minecraft operators have powerful in-game command privileges. This is separate from dashboard roles.", label: "Grant OP", dangerous: true };
    case "deop": return { title: `Remove operator from ${name}?`, description: "Their vanilla Minecraft operator status will be removed.", label: "Remove OP", dangerous: true };
  }
}
