import { Ban, Crown, ShieldCheck, UserMinus, UsersRound } from "lucide-react";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Player, PlayerAction } from "../player-schemas";

export function PlayerCard({
  player,
  canManage,
  onAction,
}: {
  player: Player;
  canManage: boolean;
  onAction: (action: PlayerAction) => void;
}) {
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
          {player.banned ? <Button variant="secondary" onClick={() => onAction("pardon")}><UsersRound aria-hidden="true" />Pardon</Button> : <Button variant="destructive" onClick={() => onAction("ban")}><Ban aria-hidden="true" />Ban</Button>}
          {player.online ? <Button variant="destructive" onClick={() => onAction("kick")}><UserMinus aria-hidden="true" />Kick</Button> : null}
        </div>
      ) : null}
    </Card>
  );
}
