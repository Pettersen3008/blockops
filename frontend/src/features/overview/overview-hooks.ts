import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOverview, runServerAction } from "./overview-api";
import { overviewKeys } from "./overview-keys";

export function useOverview() {
  return useQuery({
    queryKey: overviewKeys.detail(),
    queryFn: getOverview,
    refetchInterval: 10_000,
  });
}

export function useServerAction(onSettled: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runServerAction,
    onSuccess: () => {
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: overviewKeys.all }), 1_200);
    },
    onSettled,
  });
}
