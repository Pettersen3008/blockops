import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { overviewKeys } from "@/features/overview/keys";
import { playerKeys } from "./keys";
import { playersApi } from "./players-api";
import type { PlayerActionRequest } from "./player-schemas";

export function usePlayers() {
  return useQuery({
    queryKey: playerKeys.catalog(),
    queryFn: playersApi.catalog,
    refetchInterval: 15_000,
  });
}

export function usePlayerAction(csrfToken: string, onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PlayerActionRequest) => playersApi.runAction(csrfToken, request),
    onSuccess: () => {
      onSuccess();
      void queryClient.invalidateQueries({ queryKey: playerKeys.all });
      void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
    },
  });
}
