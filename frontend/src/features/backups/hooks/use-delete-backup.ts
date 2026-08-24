import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteBackup } from "../api/delete-backup";

export function useDeleteBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteBackup,
    // D-2c: deletion changes the catalog, overview, audit, and any other cached view.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
