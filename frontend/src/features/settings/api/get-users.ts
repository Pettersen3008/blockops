import { api, parseApiResponse } from "@/lib/api/api";
import { userCatalogSchema } from "../settings-schema";

export async function getUsers() {
  const data = await api.get("/api/v1/users");

  return parseApiResponse(data, userCatalogSchema);
}
