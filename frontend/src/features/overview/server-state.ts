import type { ServerState } from "./overview-schema";

/** One mapping from Minecraft server state to the pill and dot colours the shell uses. */
export function serverStateTone(state: ServerState): "good" | "warn" | "bad" | "neutral" {
  if (state === "online") return "good";
  if (state === "starting" || state === "stopping") return "warn";
  if (state === "offline") return "bad";
  return "neutral";
}
