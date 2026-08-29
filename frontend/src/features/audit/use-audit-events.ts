import { useInfiniteQuery } from "@tanstack/react-query";
import type { AuditFilters } from "./audit-filters";
import { auditQuery } from "./audit-query";

export function useAuditEvents(filters: AuditFilters) {
  return useInfiniteQuery(auditQuery(filters));
}
