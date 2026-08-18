import { queryOptions } from "@tanstack/react-query";
import { getPlayers } from "./api/get-players";

export const playerKeys = {
  all: ["players"] as const,
  catalog: () => [...playerKeys.all, "catalog"] as const,
};

/**
 * There is no player event stream — the only WebSocket carries raw console log lines
 * (backend/internal/console/hub.go). Presence is polled. Do not "upgrade" this to a
 * subscription that does not exist.
 */
const PLAYERS_POLL_INTERVAL_MS = 15_000;

export function playersQuery() {
  return queryOptions({
    queryKey: playerKeys.catalog(),
    queryFn: getPlayers,
    refetchInterval: PLAYERS_POLL_INTERVAL_MS,
    // staleTime is deliberately the app default (5s, app/providers/query-provider.tsx):
    // the poll owns freshness while mounted, the default owns re-entry to the route.
    // Matching it to the interval would mean up to ~29s of stale presence on revisit.
  });
}
