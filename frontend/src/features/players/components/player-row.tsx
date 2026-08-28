import { memo, type PropsWithChildren } from "react";
import { Ban, Crown, ShieldCheck, UserMinus, UsersRound } from "lucide-react";
import { Button, TableCell, TableHead, TableRow } from "@blockops/ui";
import type { PendingPlayerAction, Player } from "../player-schema";

const AVATAR_INITIALS_LENGTH = 2;
const playerBadgeTones = {
  online: "bg-primary text-primary-foreground",
  offline: "bg-secondary text-secondary-foreground",
  access: "border-border text-foreground",
  banned: "bg-destructive/10 text-destructive dark:bg-destructive/20",
} as const;

function PlayerBadge({ tone, children }: PropsWithChildren<{ tone: keyof typeof playerBadgeTones }>) {
  return (
    <span className={`inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3! ${playerBadgeTones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * memo here is measured, not decoration. At 500 rows:
 *
 *   one search keystroke         0 row renders
 *   an unchanged poll refetch    0
 *   one player's state changed   1
 *
 * It rests on two invariants that are invisible from this file:
 *
 *   1. `onAction` must be referentially stable — see requestFromRow in players-page.tsx.
 *      Swapping it for an inline arrow measures 500 renders per keystroke instead of 0.
 *   2. `player` identity comes from TanStack's structural sharing, so nothing may map,
 *      clone or re-sort the array between the query and this row.
 *
 * Break either one and every visible row re-renders on every keystroke, silently.
 */
export const PlayerRow = memo(function PlayerRow({
  player,
  canManage,
  onAction,
}: {
  player: Player;
  canManage: boolean;
  onAction: (action: PendingPlayerAction) => void;
}) {
  // One decision per toggle, so the action sent and the label shown cannot disagree.
  const allowlist = player.allowlisted
    ? ({ action: "allowlist-remove", label: "Remove allowlist" } as const)
    : ({ action: "allowlist-add", label: "Allowlist" } as const);
  const operator = player.operator
    ? ({ action: "deop", label: "De-OP" } as const)
    : ({ action: "op", label: "OP" } as const);
  const hasAccessBadge = player.allowlisted || player.operator || player.banned;

  return (
    <TableRow>
      {/* The player identifies the row, so this is a row header rather than a heading:
          seven sibling <h2>s inside cells make a document outline that is just a list of
          usernames, and a row header is what gets announced alongside every other cell. */}
      <TableHead scope="row" className="h-auto min-w-64 p-2 font-normal whitespace-normal">
        <div className="flex items-center gap-3">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten" aria-hidden="true">
            {player.name.slice(0, AVATAR_INITIALS_LENGTH).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{player.name}</span>
              <PlayerBadge tone={player.online ? "online" : "offline"}>
                {player.online ? "Online" : "Offline"}
              </PlayerBadge>
            </div>
            <code className="mt-1 block max-w-56 truncate text-xs font-normal text-muted-foreground">
              {player.uuid || "UUID unavailable"}
            </code>
          </div>
        </div>
      </TableHead>
      <TableCell className="whitespace-normal">
        <div className="flex min-w-48 flex-wrap gap-1.5">
          {player.allowlisted ? <PlayerBadge tone="access"><ShieldCheck aria-hidden="true" />Allowlisted</PlayerBadge> : null}
          {player.operator ? <PlayerBadge tone="access"><Crown aria-hidden="true" />Operator</PlayerBadge> : null}
          {player.banned ? <PlayerBadge tone="banned"><Ban aria-hidden="true" />Banned</PlayerBadge> : null}
          {hasAccessBadge ? null : <span className="text-sm text-muted-foreground">Standard access</span>}
        </div>
      </TableCell>
      {canManage ? (
        <TableCell className="whitespace-normal">
          <div className="flex min-w-max flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => onAction({ action: allowlist.action, name: player.name })}>
              <ShieldCheck data-icon="inline-start" aria-hidden="true" />
              {allowlist.label}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAction({ action: operator.action, name: player.name })}>
              <Crown data-icon="inline-start" aria-hidden="true" />
              {operator.label}
            </Button>
            {player.banned ? (
              <Button size="sm" variant="secondary" onClick={() => onAction({ action: "pardon", name: player.name })}>
                <UsersRound data-icon="inline-start" aria-hidden="true" />Pardon
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => onAction({ action: "ban", name: player.name })}>
                <Ban data-icon="inline-start" aria-hidden="true" />Ban
              </Button>
            )}
            {player.online ? (
              <Button size="sm" variant="destructive" onClick={() => onAction({ action: "kick", name: player.name })}>
                <UserMinus data-icon="inline-start" aria-hidden="true" />Kick
              </Button>
            ) : null}
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
});
