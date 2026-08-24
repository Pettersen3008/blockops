import { api, parseApiResponse } from "@/lib/api/api";
import { backupSchema } from "../backup-schema";

export async function createBackup() {
  const data = await api.post("/api/v1/backups");

  return parseApiResponse(data, backupSchema);
}
