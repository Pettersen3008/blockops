import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restoreBackup } from "../api/restore-backup";

export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreBackup,
    // D-2c: restoring can change worlds, players, console, overview, backups, and audit.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
