import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/features/auth";
import {
  createUser,
  disableUser,
  getSettings,
  getUsers,
  revokeSessions,
  updateRcon,
} from "./settings-api";
import { settingsKeys, userKeys } from "./settings-keys";

export type UserChange = { type: "disable" | "revoke"; userId: string };

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.detail(), queryFn: getSettings });
}

export function useUsers() {
  return useQuery({ queryKey: userKeys.catalog(), queryFn: getUsers });
}

export function useUpdateRcon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateRcon,
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useChangeUser(currentUserId: string, onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: UserChange) => change.type === "disable"
      ? disableUser(change.userId)
      : revokeSessions(change.userId),
    onSuccess: (_, change) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      if (change.type === "revoke" && change.userId === currentUserId) {
        void queryClient.invalidateQueries({ queryKey: authKeys.session() });
      }
      onSuccess();
    },
  });
}
