import type { ServerAction } from "./overview-schemas";

export type OverviewAction = "backup" | ServerAction;

const actionCopy: Record<OverviewAction, { title: string; description: string; label: string }> = {
  backup: {
    title: "Create a consistent backup?",
    description: "BlockOps will briefly disable world saves, flush data, archive the configured worlds, and re-enable saves.",
    label: "Create backup",
  },
  start: {
    title: "Start the Minecraft server?",
    description: "BlockOps will ask the private Docker integration to start only the configured container.",
    label: "Start server",
  },
  stop: {
    title: "Stop the Minecraft server?",
    description: "Connected players will be disconnected. Use this only when you intend downtime.",
    label: "Stop server",
  },
  restart: {
    title: "Restart the Minecraft server?",
    description: "Connected players will be disconnected while the configured container restarts.",
    label: "Restart server",
  },
};

export function confirmationFor(action: OverviewAction | null) {
  return action ? actionCopy[action] : {
    title: "Confirm action",
    description: "Confirm this server operation.",
    label: "Confirm",
  };
}
