import { api, parseApiResponse } from "@/lib/api/api";
import {
  playerActionRequestSchema,
  playerActionResponseSchema,
} from "../player-schema";
import type { PlayerActionRequest } from "../player-schema";

export async function runPlayerAction(request: PlayerActionRequest) {
  const body = playerActionRequestSchema.parse(request);
  const data = await api.post("/api/v1/players/actions", { body });
  return parseApiResponse(data, playerActionResponseSchema);
}
