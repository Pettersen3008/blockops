import { api, parseApiResponse } from "@/lib/api/api";
import { auditCatalogSchema } from "./audit-schema";

export async function getAuditEvents() {
  const data = await api.get("/api/v1/audit?limit=200");

  return parseApiResponse(data, auditCatalogSchema);
}
