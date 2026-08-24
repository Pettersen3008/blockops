import { queryOptions } from "@tanstack/react-query";
import { getAuditEvents } from "./get-audit-events";

export function auditQuery() {
  return queryOptions({
    queryKey: ["audit", "catalog"] as const,
    queryFn: getAuditEvents,
    // The application default stale time owns route re-entry freshness.
  });
}
