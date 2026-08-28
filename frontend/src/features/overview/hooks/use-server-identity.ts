import type { ServerState } from "../overview-schema";
import { useOverview } from "./use-overview";

export interface ServerIdentity {
  state: ServerState;
  software?: string;
  version?: string;
  uptimeSeconds?: number;
}

/**
 * The shell's read of the configured server. It shares the overview query, so the
 * sidebar and header follow the same poll instead of adding a second one.
 */
export function useServerIdentity(): ServerIdentity {
  const server = useOverview().data?.server;
  if (!server?.available) return { state: "unknown" };
  return {
    state: server.value.state,
    software: server.value.software,
    version: server.value.version,
    uptimeSeconds: server.value.uptimeSeconds,
  };
}
