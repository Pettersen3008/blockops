import { z } from "zod";
import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";

export async function deleteBackup(id: string) {
  const data = await api.delete(serverPath(`/backups/${encodeURIComponent(id)}`));

  return parseApiResponse(data, z.undefined());
}
