import { AUDIT_SEARCH_MAX_LENGTH, auditOutcomeFilterSchema } from "./audit-schema";
import type { AuditOutcomeFilter } from "./audit-schema";

export type AuditFilters = {
  query: string;
  outcome: AuditOutcomeFilter;
};

export function parseAuditSearchParams(searchParams: URLSearchParams): AuditFilters {
  const query = searchParams.get("q") ?? "";

  return {
    query: Array.from(query).length <= AUDIT_SEARCH_MAX_LENGTH ? query : "",
    outcome: parseOutcomeFilter(searchParams.get("outcome")),
  };
}

export function parseOutcomeFilter(value: string | null): AuditOutcomeFilter {
  const parsed = auditOutcomeFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : "all";
}

export function auditFilterSearchParams(filters: AuditFilters): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (filters.query) searchParams.set("q", filters.query);
  searchParams.set("outcome", filters.outcome);
  return searchParams;
}

export function hasAuditFilters(filters: AuditFilters): boolean {
  return filters.query.trim() !== "" || filters.outcome !== "all";
}
