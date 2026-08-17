import { useQuery } from "@tanstack/react-query";
import { getAudit } from "./audit-api";
import { auditKeys } from "./audit-keys";

export function useAuditEvents() {
  return useQuery({ queryKey: auditKeys.catalog(), queryFn: getAudit });
}
