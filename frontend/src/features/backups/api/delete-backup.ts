import { z } from "zod";
import { api, parseApiResponse } from "@/lib/api/api";

export async function deleteBackup(id: string) {
  const data = await api.delete(`/api/v1/backups/${encodeURIComponent(id)}`);

  return parseApiResponse(data, z.undefined());
}
