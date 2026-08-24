import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revokeUserSessions } from "../api/revoke-user-sessions";

type RevokeUserSessionsInput = { userId: string; surfaceId: number };

export function useRevokeUserSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: RevokeUserSessionsInput) => revokeUserSessions(userId),
    // D-2c: revoked sessions affect authentication and audit-backed views.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
