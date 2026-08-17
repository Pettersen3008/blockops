import { api, parseApiResponse } from "@/lib/api/api";
import { consoleCommandResponseSchema, consoleHistorySchema } from "./console-schemas";

export async function getConsoleHistory() {
  const data = await api.get("/api/v1/console/history");
  return parseApiResponse(data, consoleHistorySchema);
}

export async function executeConsoleCommand(command: string) {
  const data = await api.post("/api/v1/console/commands", { body: { command } });
  return parseApiResponse(data, consoleCommandResponseSchema);
}
