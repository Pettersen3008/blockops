import { api, parseApiResponse } from "@/lib/api/api";
import { overviewSchema } from "../overview-schema";

export async function getOverview() {
  const data = await api.get("/api/v1/overview");

  return parseApiResponse(data, overviewSchema);
}
