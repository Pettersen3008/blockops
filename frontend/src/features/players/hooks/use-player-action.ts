import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runPlayerAction } from "../api/run-player-action";

export function usePlayerAction(onSuccess: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runPlayerAction,
    onSuccess: () => {
      onSuccess();
      void queryClient.invalidateQueries();
    },
  });
}
