import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getPlayers } from "../api/get-players";
import { runPlayerAction } from "../api/run-player-action";

const playerKeys = {
  all: ["players"] as const,
  catalog: () => [...playerKeys.all, "catalog"] as const,
};

export function playersQuery() {
  return queryOptions({
    queryKey: playerKeys.catalog(),
    queryFn: getPlayers,
    refetchInterval: 15_000,
  });
}

export function usePlayers() {
  return useQuery(playersQuery());
}

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
