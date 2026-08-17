import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBackup, deleteBackup, getBackups, restoreBackup } from "./backups-api";
import { backupKeys } from "./backups-keys";

interface MutationCallbacks {
  onSuccess?: () => void;
  onSettled?: () => void;
}

function useBackupInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries();
  };
}

export function useBackups() {
  return useQuery({ queryKey: backupKeys.catalog(), queryFn: getBackups });
}

export function useCreateBackup(callbacks: MutationCallbacks = {}) {
  const invalidate = useBackupInvalidation();
  return useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      invalidate();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}

export function useDeleteBackup(callbacks: MutationCallbacks = {}) {
  const invalidate = useBackupInvalidation();
  return useMutation({
    mutationFn: deleteBackup,
    onSuccess: () => {
      invalidate();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}

export function useRestoreBackup(callbacks: MutationCallbacks = {}) {
  const invalidate = useBackupInvalidation();
  return useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => {
      invalidate();
      callbacks.onSuccess?.();
    },
    onSettled: callbacks.onSettled,
  });
}
