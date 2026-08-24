import { queryOptions } from "@tanstack/react-query";
import { getConsoleHistory } from "./api/get-console-history";

export const consoleKeys = {
  all: ["console"] as const,
  history: () => [...consoleKeys.all, "history"] as const,
};

export function consoleHistoryQuery() {
  return queryOptions({
    queryKey: consoleKeys.history(),
    queryFn: getConsoleHistory,
    // The application default stale time applies: history seeds the live stream,
    // while WebSocket lines own freshness after the route mounts.
  });
}
