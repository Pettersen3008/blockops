import type { PlayerAction, ReasonPlayerAction } from "./player-schema";

interface ActionCopy<A extends PlayerAction> {
  title: (name: string) => string;
  description: string;
  confirmLabel: string;
  dangerous: boolean;
  /**
   * Not a choice — the wire contract decides. True exactly when this action's schema
   * takes a reason, so the table cannot drift from playerActionRequestSchema.
   */
  needsReason: A extends ReasonPlayerAction ? true : false;
}

/**
 * Every confirmable action needs confirmation copy, so this table is total. The mapped
 * type makes an eighth action in the union fail to compile until it has an entry here.
 *
 * Row button labels deliberately live in player-row.tsx instead: the row says
 * "Allowlist" where the dialog commits to "Add to allowlist", and the row renders four
 * conditional slots rather than seven buttons.
 */
export const playerActionCopy: { [A in PlayerAction]: ActionCopy<A> } = {
  "allowlist-add": {
    title: (name) => `Allowlist ${name}?`,
    description: "The player will be allowed to join when the server allowlist is enabled.",
    confirmLabel: "Add to allowlist",
    dangerous: false,
    needsReason: false,
  },
  "allowlist-remove": {
    title: (name) => `Remove ${name} from the allowlist?`,
    description: "They may no longer be able to join. This does not disconnect an online player.",
    confirmLabel: "Remove",
    dangerous: true,
    needsReason: false,
  },
  kick: {
    title: (name) => `Kick ${name}?`,
    description: "The player will be disconnected immediately but can reconnect if otherwise allowed.",
    confirmLabel: "Kick player",
    dangerous: true,
    needsReason: true,
  },
  ban: {
    title: (name) => `Ban ${name}?`,
    description: "The player will be blocked from joining until pardoned.",
    confirmLabel: "Ban player",
    dangerous: true,
    needsReason: true,
  },
  pardon: {
    title: (name) => `Pardon ${name}?`,
    description: "The vanilla player ban will be removed.",
    confirmLabel: "Pardon player",
    dangerous: false,
    needsReason: false,
  },
  op: {
    title: (name) => `Grant operator to ${name}?`,
    description: "Minecraft operators have powerful in-game command privileges. This is separate from dashboard roles.",
    confirmLabel: "Grant OP",
    dangerous: true,
    needsReason: false,
  },
  deop: {
    title: (name) => `Remove operator from ${name}?`,
    description: "Their vanilla Minecraft operator status will be removed.",
    confirmLabel: "Remove OP",
    dangerous: true,
    needsReason: false,
  },
};
