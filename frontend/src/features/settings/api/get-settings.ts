import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { settingsDataSchema } from "../settings-schema";

export async function getSettings() {
  const data = await api.get(serverPath("/settings"));

  return parseApiResponse(data, settingsDataSchema);
}
