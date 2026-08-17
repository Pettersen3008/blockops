import { z } from "zod";
import { api, parseApiResponse } from "@/lib/api/api";
import {
  backupCatalogSchema,
  backupSchema,
  restoreBackupResponseSchema,
} from "./backup-schemas";

export async function getBackups() {
  const data = await api.get("/api/v1/backups");
  return parseApiResponse(data, backupCatalogSchema);
}

export async function createBackup() {
  const data = await api.post("/api/v1/backups");
  return parseApiResponse(data, backupSchema);
}

export async function deleteBackup(id: string) {
  const data = await api.delete(`/api/v1/backups/${encodeURIComponent(id)}`);
  return parseApiResponse(data, z.undefined());
}

export async function restoreBackup(id: string) {
  const data = await api.post(`/api/v1/backups/${encodeURIComponent(id)}/restore`);
  return parseApiResponse(data, restoreBackupResponseSchema);
}

export function backupDownloadUrl(id: string): string {
  return `/api/v1/backups/${encodeURIComponent(id)}/download`;
}
