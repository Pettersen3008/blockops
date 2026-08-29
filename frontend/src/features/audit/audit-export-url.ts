import { auditFilterSearchParams } from "./audit-filters";
import type { AuditFilters } from "./audit-filters";

export function auditExportUrl(filters: AuditFilters): string {
  return `/api/v1/audit/export?${auditFilterSearchParams(filters)}`;
}
