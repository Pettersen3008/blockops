import { serverPath } from "@/lib/api/server-path";

export function backupDownloadUrl(id: string): string {
  // Native anchor navigation owns this GET download. It must not become query state.
  return serverPath(`/backups/${encodeURIComponent(id)}/download`);
}
