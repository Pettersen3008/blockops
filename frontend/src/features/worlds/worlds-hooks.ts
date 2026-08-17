import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceWorld } from "./worlds-api";

export function useReplaceWorld(onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: replaceWorld,
    onSuccess: () => {
      onSuccess();
      void queryClient.invalidateQueries();
    },
  });
}
