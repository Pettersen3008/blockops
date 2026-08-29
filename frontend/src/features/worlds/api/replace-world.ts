import { api, parseApiResponse } from "@/lib/api/api";
import { serverPath } from "@/lib/api/server-path";
import { replaceWorldResponseSchema } from "../world-schemas";

export async function replaceWorld(file: File) {
  const data = await api.put(serverPath("/world"), { body: file });

  return parseApiResponse(data, replaceWorldResponseSchema);
}
