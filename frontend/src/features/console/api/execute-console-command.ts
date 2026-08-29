import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { consoleCommandResponseSchema } from "../console-schema";

export async function executeConsoleCommand(command: string) {
  const data = await api.post(serverPath("/console/commands"), { body: { command } });

  return parseApiResponse(data, consoleCommandResponseSchema);
}
