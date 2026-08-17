import { httpRequest } from "@/lib/api/http-client";
import { consoleCommandResponseSchema, consoleHistorySchema } from "./console-schemas";

export const consoleApi = {
  history: () => httpRequest("/api/v1/console/history", consoleHistorySchema),
  execute: (csrfToken: string, command: string) => httpRequest(
    "/api/v1/console/commands",
    consoleCommandResponseSchema,
    { method: "POST", body: JSON.stringify({ command }), csrfToken },
  ),
};
