import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateRcon } from "../api/update-rcon";

export function useUpdateRcon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateRcon,
    // D-2c: credentials can change every integration-backed view.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
