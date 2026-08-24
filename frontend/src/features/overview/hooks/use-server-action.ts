import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runServerAction } from "../api/run-server-action";
import { overviewKeys } from "../overview-query";

export function useServerAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runServerAction,
    onSuccess: () => {
      // D-2c: lifecycle changes affect players, sessions, audit, and every server-backed view.
      void queryClient.invalidateQueries();
      // Docker accepts the action before the state transition settles. Preserve the later
      // Overview refresh without delaying the broad invalidation or success cleanup.
      window.setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: overviewKeys.all }),
        1_200,
      );
    },
  });
}
