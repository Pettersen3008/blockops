import { api, parseApiResponse } from "@/lib/api/api";
import {
  serverActionResponseSchema,
  type ServerAction,
} from "../overview-schema";

export async function runServerAction(action: ServerAction) {
  const data = await api.post("/api/v1/server/actions", { body: { action } });

  return parseApiResponse(data, serverActionResponseSchema);
}
