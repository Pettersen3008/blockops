import { api, parseApiResponse } from "@/lib/api/api";
import { playerCatalogSchema } from "../player-schema";

export async function getPlayers() {
  const data = await api.get("/api/v1/players");
  return parseApiResponse(data, playerCatalogSchema);
}
