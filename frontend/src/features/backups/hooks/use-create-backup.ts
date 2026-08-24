import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBackup } from "../api/create-backup";

interface BackupMutationCallbacks {
  onSuccess?: () => void;
  onSettled?: () => void;
}

export function useCreateBackup(callbacks: BackupMutationCallbacks = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBackup,
    // D-2c: creating a backup can change every server-backed view, including overview,
    // audit, and session. The response parses before this success path can run.
    onSuccess: () => {
      void queryClient.invalidateQueries();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}
