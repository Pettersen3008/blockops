import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { overviewApi } from "./overview.api";
import { overviewKeys } from "./overview.keys";
import type { ServerAction } from "./overview.schemas";

export function useOverview() {
  return useQuery({
    queryKey: overviewKeys.detail(),
    queryFn: overviewApi.get,
    refetchInterval: 10_000,
  });
}

export function useServerAction(csrfToken: string, onSettled: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: ServerAction) => overviewApi.runServerAction(csrfToken, action),
    onSuccess: () => {
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: overviewKeys.all }), 1_200);
    },
    onSettled,
  });
}
