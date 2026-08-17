import { httpRequest } from "@/lib/api/http-client";
import { auditCatalogSchema } from "./audit-schemas";

export const auditApi = {
  catalog: () => httpRequest("/api/v1/audit?limit=200", auditCatalogSchema),
};
