export function backupDownloadUrl(id: string): string {
  // Native anchor navigation owns this GET download. It must not become query state.
  return `/api/v1/backups/${encodeURIComponent(id)}/download`;
}
