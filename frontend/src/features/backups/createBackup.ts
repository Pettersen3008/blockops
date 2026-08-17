import { useMutation } from "@tanstack/react-query";
import { httpRequest } from "@/lib/api/httpClient";
import { backupSchema } from "./backup.schemas";

function createBackup(csrfToken: string) {
  return httpRequest(
    "/api/v1/backups",
    backupSchema,
    { method: "POST", csrfToken },
  );
}

export function useCreateBackup(
  csrfToken: string,
  callbacks: { onSuccess: () => void; onSettled: () => void },
) {
  return useMutation({
    mutationFn: () => createBackup(csrfToken),
    onSuccess: callbacks.onSuccess,
    onSettled: callbacks.onSettled,
  });
}
