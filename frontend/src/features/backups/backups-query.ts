import { queryOptions } from "@tanstack/react-query";
import { getBackups } from "./api/get-backups";

export const backupKeys = {
  all: ["backups"] as const,
  catalog: () => [...backupKeys.all, "catalog"] as const,
};

export function backupsQuery() {
  return queryOptions({
    queryKey: backupKeys.catalog(),
    queryFn: getBackups,
    // Keep the app default stale time. Backups do not poll, so revisiting after five
    // seconds refetches the catalog while TanStack Query keeps sole ownership of it.
  });
}
