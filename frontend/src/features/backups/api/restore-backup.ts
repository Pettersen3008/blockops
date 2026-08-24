import { api, parseApiResponse } from "@/lib/api/api";
import { restoreBackupResponseSchema } from "../backup-schema";

export async function restoreBackup(id: string) {
  const data = await api.post(`/api/v1/backups/${encodeURIComponent(id)}/restore`);

  return parseApiResponse(data, restoreBackupResponseSchema);
}
