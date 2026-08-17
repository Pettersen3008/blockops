import { api, parseApiResponse } from "@/lib/api/api";
import { playerActionRequestSchema, playerActionResponseSchema, playerCatalogSchema } from "./player-schemas";
import type { PlayerActionRequest } from "./player-schemas";

export async function getPlayers() {
  const data = await api.get("/api/v1/players");
  return parseApiResponse(data, playerCatalogSchema);
}

export async function runPlayerAction(request: PlayerActionRequest) {
  const body = playerActionRequestSchema.parse(request);
  const data = await api.post("/api/v1/players/actions", { body });
  return parseApiResponse(data, playerActionResponseSchema);
}
