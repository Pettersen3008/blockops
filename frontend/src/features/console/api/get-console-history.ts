import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { consoleHistorySchema } from "../console-schema";

export async function getConsoleHistory() {
  const data = await api.get(serverPath("/console/history"));

  return parseApiResponse(data, consoleHistorySchema);
}
