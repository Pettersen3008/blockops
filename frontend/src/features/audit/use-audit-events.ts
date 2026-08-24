import { useQuery } from "@tanstack/react-query";
import { auditQuery } from "./audit-query";

export function useAuditEvents() {
  return useQuery(auditQuery());
}
