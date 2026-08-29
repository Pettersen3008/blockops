import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { backupCatalogSchema } from "../backup-schema";

export async function getBackups() {
  const data = await api.get(serverPath("/backups"));

  return parseApiResponse(data, backupCatalogSchema);
}
