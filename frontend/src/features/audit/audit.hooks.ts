import { useQuery } from "@tanstack/react-query";
import { auditApi } from "./audit.api";
import { auditKeys } from "./audit.keys";

export function useAuditEvents() {
  return useQuery({ queryKey: auditKeys.catalog(), queryFn: auditApi.catalog });
}
