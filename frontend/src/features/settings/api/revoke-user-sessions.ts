import { api, parseApiResponse } from "@/lib/api/api";
import { emptyResponseSchema } from "../settings-schema";

export async function revokeUserSessions(userId: string) {
  const data = await api.post(`/api/v1/fleet/users/${encodeURIComponent(userId)}/revoke-sessions`);

  return parseApiResponse(data, emptyResponseSchema);
}
