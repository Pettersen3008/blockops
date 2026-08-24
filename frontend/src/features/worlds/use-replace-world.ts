import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceWorld } from "./api/replace-world";

export function useReplaceWorld() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: replaceWorld,
    // Broad invalidation is recorded decision D-2c (docs/refactor-progress.md): a
    // replacement can change the world, server, players, backups, and audit views.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
