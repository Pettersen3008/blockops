import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { overviewKeys } from "@/features/overview/keys";
import { playerKeys } from "./keys";
import { getPlayers, runPlayerAction } from "./players-api";

export function usePlayers() {
  return useQuery({
    queryKey: playerKeys.catalog(),
    queryFn: getPlayers,
    refetchInterval: 15_000,
  });
}

export function usePlayerAction(onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runPlayerAction,
    onSuccess: () => {
      onSuccess();
      void queryClient.invalidateQueries({ queryKey: playerKeys.all });
      void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
    },
  });
}
