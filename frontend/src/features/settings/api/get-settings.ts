import { api, parseApiResponse } from "@/lib/api/api";
import { settingsDataSchema } from "../settings-schema";

export async function getSettings() {
  const data = await api.get("/api/v1/settings");

  return parseApiResponse(data, settingsDataSchema);
}
