import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { restoreBackupResponseSchema } from "../backup-schema";

export async function restoreBackup(id: string) {
  const data = await api.post(serverPath(`/backups/${encodeURIComponent(id)}/restore`));

  return parseApiResponse(data, restoreBackupResponseSchema);
}
