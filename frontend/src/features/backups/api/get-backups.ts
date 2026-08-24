import { api, parseApiResponse } from "@/lib/api/api";
import { backupCatalogSchema } from "../backup-schema";

export async function getBackups() {
  const data = await api.get("/api/v1/backups");

  return parseApiResponse(data, backupCatalogSchema);
}
