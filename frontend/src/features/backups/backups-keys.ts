export const backupKeys = {
  all: ["backups"] as const,
  catalog: () => [...backupKeys.all, "catalog"] as const,
};
