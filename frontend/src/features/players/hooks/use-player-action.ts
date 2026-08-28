import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runPlayerAction } from "../api/run-player-action";

/**
 * The hook exists to own the invalidation this mutation causes, not to rename
 * useMutation. It deliberately takes no success callback: what a *surface* does after a
 * successful action differs per surface, so that belongs in mutate(request, { onSuccess })
 * at the call site. A shared callback here is how a kick ended up clearing the allowlist
 * form.
 */
export function usePlayerAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runPlayerAction,
    // Player actions can change player data shown by every server view.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
