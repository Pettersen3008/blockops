import { api, parseApiResponse } from "@/lib/api/api";
import { consoleHistorySchema } from "../console-schema";

export async function getConsoleHistory() {
  const data = await api.get("/api/v1/console/history");

  return parseApiResponse(data, consoleHistorySchema);
}
