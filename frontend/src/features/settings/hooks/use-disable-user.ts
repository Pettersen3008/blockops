import { useMutation, useQueryClient } from "@tanstack/react-query";
import { disableUser } from "../api/disable-user";

type DisableUserInput = { userId: string; surfaceId: number };

export function useDisableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: DisableUserInput) => disableUser(userId),
    // D-2c: disabling a user revokes sessions and writes audit state.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
