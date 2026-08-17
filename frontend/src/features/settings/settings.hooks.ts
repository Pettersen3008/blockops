import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/features/auth";
import { overviewKeys } from "@/features/overview/keys";
import { settingsApi } from "./settings.api";
import { settingsKeys, userKeys } from "./settings.keys";
import type { CreateUserRequest, RconCredentials } from "./settings.schemas";

export type UserChange = { type: "disable" | "revoke"; userId: string };

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.detail(), queryFn: settingsApi.get });
}

export function useUsers() {
  return useQuery({ queryKey: userKeys.catalog(), queryFn: settingsApi.users });
}

export function useUpdateRcon(csrfToken: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: RconCredentials) => settingsApi.updateRcon(csrfToken, credentials),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      void queryClient.invalidateQueries({ queryKey: overviewKeys.all });
    },
  });
}

export function useCreateUser(csrfToken: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserRequest) => settingsApi.createUser(csrfToken, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useChangeUser(csrfToken: string, currentUserId: string, onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: UserChange) => change.type === "disable"
      ? settingsApi.disableUser(csrfToken, change.userId)
      : settingsApi.revokeSessions(csrfToken, change.userId),
    onSuccess: (_, change) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      if (change.type === "revoke" && change.userId === currentUserId) {
        void queryClient.invalidateQueries({ queryKey: authKeys.session() });
      }
      onSuccess();
    },
  });
}
