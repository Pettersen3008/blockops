import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { backupSchema } from "../backup-schema";

export async function createBackup() {
  const data = await api.post(serverPath("/backups"));

  return parseApiResponse(data, backupSchema);
}
