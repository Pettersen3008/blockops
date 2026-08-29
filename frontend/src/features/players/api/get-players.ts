import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { playerCatalogSchema } from "../player-schema";

export async function getPlayers() {
  const data = await api.get(serverPath("/players"));
  return parseApiResponse(data, playerCatalogSchema);
}
