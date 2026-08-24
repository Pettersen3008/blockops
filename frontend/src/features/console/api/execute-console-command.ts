import { api, parseApiResponse } from "@/lib/api/api";
import { consoleCommandResponseSchema } from "../console-schema";

export async function executeConsoleCommand(command: string) {
  const data = await api.post("/api/v1/console/commands", { body: { command } });

  return parseApiResponse(data, consoleCommandResponseSchema);
}
