import { infiniteQueryOptions } from "@tanstack/react-query";
import type { AuditFilters } from "./audit-filters";
import { getAuditEvents } from "./get-audit-events";

export function auditQuery(filters: AuditFilters) {
  return infiniteQueryOptions({
    queryKey: ["audit", "catalog", filters] as const,
    initialPageParam: initialAuditCursor(),
    queryFn: ({ pageParam }) => getAuditEvents({ filters, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    // The application default stale time owns route re-entry freshness.
  });
}

function initialAuditCursor(): string | null {
  return null;
}
