import { api, parseApiResponse } from "@/lib/api/api";
import { replaceWorldResponseSchema } from "../world-schemas";

export async function replaceWorld(file: File) {
  const data = await api.put("/api/v1/world", { body: file });

  return parseApiResponse(data, replaceWorldResponseSchema);
}
