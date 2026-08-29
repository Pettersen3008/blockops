import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { rconStatusSchema } from "../settings-schema";
import type { RconCredentials } from "../settings-schema";

export async function updateRcon(credentials: RconCredentials) {
  const data = await api.put(serverPath("/settings/rcon"), { body: credentials });

  return parseApiResponse(data, rconStatusSchema);
}
