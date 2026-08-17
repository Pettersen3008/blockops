import { api, parseApiResponse } from "@/lib/api/api";
import {
  overviewSchema,
  serverActionResponseSchema,
  serverActionSchema,
} from "./overview-schemas";
import type { ServerAction } from "./overview-schemas";

export async function getOverview() {
  const data = await api.get("/api/v1/overview");
  return parseApiResponse(data, overviewSchema);
}

export async function runServerAction(action: ServerAction) {
  const body = { action: serverActionSchema.parse(action) };
  const data = await api.post("/api/v1/server/actions", { body });
  return parseApiResponse(data, serverActionResponseSchema);
}
