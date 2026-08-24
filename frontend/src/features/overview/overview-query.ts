import { queryOptions } from "@tanstack/react-query";
import { getOverview } from "./api/get-overview";

export const overviewKeys = {
  all: ["overview"] as const,
  detail: () => [...overviewKeys.all, "detail"] as const,
};

export function overviewQuery() {
  return queryOptions({
    queryKey: overviewKeys.detail(),
    queryFn: getOverview,
    refetchInterval: 10_000,
    // Keep the application default staleTime. Polling owns mounted freshness while the
    // 5-second default in query-provider.tsx owns route re-entry.
  });
}
