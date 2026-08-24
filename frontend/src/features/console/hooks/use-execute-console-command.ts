import { useMutation, useQueryClient } from "@tanstack/react-query";
import { executeConsoleCommand } from "../api/execute-console-command";

export function useExecuteConsoleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: executeConsoleCommand,
    // D-2c: a command can change any server-backed view.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
