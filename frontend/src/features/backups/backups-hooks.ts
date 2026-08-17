import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { overviewKeys } from "@/features/overview/keys";
import { backupsApi } from "./backups-api";
import { backupKeys } from "./backups-keys";

interface MutationCallbacks {
  onSuccess?: () => void;
  onSettled?: () => void;
}

function useBackupInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: backupKeys.all });
    void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
  };
}

export function useBackups() {
  return useQuery({ queryKey: backupKeys.catalog(), queryFn: backupsApi.catalog });
}

export function useCreateBackup(csrfToken: string, callbacks: MutationCallbacks = {}) {
  const invalidate = useBackupInvalidation();
  return useMutation({
    mutationFn: () => backupsApi.create(csrfToken),
    onSuccess: () => {
      invalidate();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}

export function useDeleteBackup(csrfToken: string, callbacks: MutationCallbacks = {}) {
  const invalidate = useBackupInvalidation();
  return useMutation({
    mutationFn: (id: string) => backupsApi.delete(csrfToken, id),
    onSuccess: () => {
      invalidate();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}

export function useRestoreBackup(csrfToken: string, callbacks: MutationCallbacks = {}) {
  const invalidate = useBackupInvalidation();
  return useMutation({
    mutationFn: (id: string) => backupsApi.restore(csrfToken, id),
    onSuccess: () => {
      invalidate();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}
