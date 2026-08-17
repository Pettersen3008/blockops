import { memo } from "react";
import { Ban, Crown, ShieldCheck, UserMinus, UsersRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { PendingPlayerAction, Player } from "../schemas/player-schema";

export const PlayerRow = memo(function PlayerRow({
  player,
  canManage,
  onAction,
}: {
  player: Player;
  canManage: boolean;
  onAction: (action: PendingPlayerAction) => void;
}) {
  return (
    <TableRow>
      <TableCell className="min-w-64 whitespace-normal">
        <div className="flex items-center gap-3">
          <Avatar size="lg" aria-hidden="true">
            <AvatarFallback>{player.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{player.name}</h2>
              <Badge variant={player.online ? "default" : "secondary"}>
                {player.online ? "Online" : "Offline"}
              </Badge>
            </div>
            <code className="mt-1 block max-w-56 truncate text-xs text-muted-foreground">
              {player.uuid || "UUID unavailable"}
            </code>
          </div>
        </div>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex min-w-48 flex-wrap gap-1.5">
          {player.allowlisted ? <Badge variant="outline"><ShieldCheck aria-hidden="true" />Allowlisted</Badge> : null}
          {player.operator ? <Badge variant="outline"><Crown aria-hidden="true" />Operator</Badge> : null}
          {player.banned ? <Badge variant="destructive"><Ban aria-hidden="true" />Banned</Badge> : null}
          {!player.allowlisted && !player.operator && !player.banned ? (
            <span className="text-sm text-muted-foreground">Standard access</span>
          ) : null}
        </div>
      </TableCell>
      {canManage ? (
        <TableCell className="whitespace-normal">
          <div className="flex min-w-max flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => onAction({ action: player.allowlisted ? "allowlist-remove" : "allowlist-add", name: player.name })}>
              <ShieldCheck data-icon="inline-start" aria-hidden="true" />
              {player.allowlisted ? "Remove allowlist" : "Allowlist"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAction({ action: player.operator ? "deop" : "op", name: player.name })}>
              <Crown data-icon="inline-start" aria-hidden="true" />
              {player.operator ? "De-OP" : "OP"}
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
