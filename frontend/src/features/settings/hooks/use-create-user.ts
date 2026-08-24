import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createUser } from "../api/create-user";

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    // D-2c: user changes can affect sessions, navigation, and audit-backed views.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
