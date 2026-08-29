import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { overviewSchema } from "../overview-schema";

export async function getOverview() {
  const data = await api.get(serverPath("/overview"));

  return parseApiResponse(data, overviewSchema);
}
