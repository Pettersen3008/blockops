import { api, parseApiResponse } from "@/lib/api/api";
import { emptyResponseSchema } from "../settings-schema";

export async function disableUser(userId: string) {
  const data = await api.delete(`/api/v1/users/${encodeURIComponent(userId)}`);

  return parseApiResponse(data, emptyResponseSchema);
}
