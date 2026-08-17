import { z } from "zod";
import { httpRequest } from "@/lib/api/http-client";
import {
  backupCatalogSchema,
  backupSchema,
  restoreBackupResponseSchema,
} from "./backup-schemas";

export const backupsApi = {
  catalog: () => httpRequest("/api/v1/backups", backupCatalogSchema),
  create: (csrfToken: string) => httpRequest(
    "/api/v1/backups",
    backupSchema,
    { method: "POST", csrfToken },
  ),
  delete: (csrfToken: string, id: string) => httpRequest(
    `/api/v1/backups/${encodeURIComponent(id)}`,
    z.undefined(),
    { method: "DELETE", csrfToken },
  ),
  restore: (csrfToken: string, id: string) => httpRequest(
    `/api/v1/backups/${encodeURIComponent(id)}/restore`,
    restoreBackupResponseSchema,
    { method: "POST", csrfToken },
  ),
};

export function backupDownloadUrl(id: string): string {
  return `/api/v1/backups/${encodeURIComponent(id)}/download`;
}
