import { httpRequest } from "@/lib/api/http-client";
import { playerActionRequestSchema, playerActionResponseSchema, playerCatalogSchema } from "./player-schemas";
import type { PlayerActionRequest } from "./player-schemas";

export const playersApi = {
  catalog: () => httpRequest("/api/v1/players", playerCatalogSchema),
  runAction: (csrfToken: string, request: PlayerActionRequest) => httpRequest(
    "/api/v1/players/actions",
    playerActionResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(playerActionRequestSchema.parse(request)),
      csrfToken,
    },
  ),
};
