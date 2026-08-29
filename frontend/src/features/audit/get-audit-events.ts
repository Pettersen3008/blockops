import { api, parseApiResponse } from "@/lib/api/api";
import { auditFilterSearchParams } from "./audit-filters";
import type { AuditFilters } from "./audit-filters";
import { auditPageSchema } from "./audit-schema";
import type { AuditPage } from "./audit-schema";

export async function getAuditEvents({ filters, cursor }: { filters: AuditFilters; cursor: string | null }): Promise<AuditPage> {
  const searchParams = auditFilterSearchParams(filters);
  searchParams.set("limit", "100");
  if (cursor) searchParams.set("cursor", cursor);
  const data = await api.get(`/api/v1/audit?${searchParams}`);

  return parseApiResponse(data, auditPageSchema);
}
