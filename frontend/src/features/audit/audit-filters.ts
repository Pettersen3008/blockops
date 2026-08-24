import { z } from "zod";
import { auditOutcomeFilterSchema } from "./audit-schema";
import type { AuditEvent, AuditOutcomeFilter } from "./audit-schema";

export type AuditFilters = {
  query: string;
  outcome: AuditOutcomeFilter;
};

export function parseAuditSearchParams(searchParams: URLSearchParams): AuditFilters {
  const query = z.string().nullable().transform((value) => value ?? "").parse(searchParams.get("q"));

  return { query, outcome: parseOutcomeFilter(searchParams.get("outcome")) };
}

export function parseOutcomeFilter(value: string | null): AuditOutcomeFilter {
  const parsed = auditOutcomeFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : "all";
}

export function matchesAuditFilters(event: AuditEvent, query: string, outcome: AuditOutcomeFilter): boolean {
  if (outcome !== "all" && event.outcome !== outcome) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [event.username, event.action, event.target, event.sourceIp, JSON.stringify(event.details ?? {})]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}
