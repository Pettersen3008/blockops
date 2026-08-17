import type { PlayerAction } from "./schemas/player-schema";

interface ActionCopy {
  title: (name: string) => string;
  description: string;
  label: string;
  dangerous: boolean;
}

const actionCopy: Record<PlayerAction, ActionCopy> = {
  "allowlist-add": { title: (name) => `Allowlist ${name}?`, description: "The player will be allowed to join when the server allowlist is enabled.", label: "Add to allowlist", dangerous: false },
  "allowlist-remove": { title: (name) => `Remove ${name} from the allowlist?`, description: "They may no longer be able to join. This does not disconnect an online player.", label: "Remove", dangerous: true },
  kick: { title: (name) => `Kick ${name}?`, description: "The player will be disconnected immediately but can reconnect if otherwise allowed.", label: "Kick player", dangerous: true },
  ban: { title: (name) => `Ban ${name}?`, description: "The player will be blocked from joining until pardoned.", label: "Ban player", dangerous: true },
  pardon: { title: (name) => `Pardon ${name}?`, description: "The vanilla player ban will be removed.", label: "Pardon player", dangerous: false },
  op: { title: (name) => `Grant operator to ${name}?`, description: "Minecraft operators have powerful in-game command privileges. This is separate from dashboard roles.", label: "Grant OP", dangerous: true },
  deop: { title: (name) => `Remove operator from ${name}?`, description: "Their vanilla Minecraft operator status will be removed.", label: "Remove OP", dangerous: true },
};

export function actionDetails(action: PlayerAction, name: string) {
  const copy = actionCopy[action];
  return { ...copy, title: copy.title(name) };
}
