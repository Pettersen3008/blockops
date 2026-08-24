import { api, parseApiResponse } from "@/lib/api/api";
import { rconStatusSchema } from "../settings-schema";
import type { RconCredentials } from "../settings-schema";

export async function updateRcon(credentials: RconCredentials) {
  const data = await api.put("/api/v1/settings/rcon", { body: credentials });

  return parseApiResponse(data, rconStatusSchema);
}
