import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceWorld } from "./api/replace-world";

export function useReplaceWorld() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: replaceWorld,
    // Replacing a world can change every cached server view.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
