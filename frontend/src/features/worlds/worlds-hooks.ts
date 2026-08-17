import { useMutation, useQueryClient } from "@tanstack/react-query";
import { overviewKeys } from "@/features/overview/keys";
import { playerKeys } from "@/features/players/keys";
import { replaceWorld } from "./worlds-api";

export function useReplaceWorld(onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: replaceWorld,
    onSuccess: () => {
      onSuccess();
      void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: playerKeys.all });
    },
  });
}
