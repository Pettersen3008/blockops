import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import {
  serverActionResponseSchema,
  type ServerAction,
} from "../overview-schema";

export async function runServerAction(action: ServerAction) {
  const data = await api.post(serverPath("/actions"), { body: { action } });

  return parseApiResponse(data, serverActionResponseSchema);
}
