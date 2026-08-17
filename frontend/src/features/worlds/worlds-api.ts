import { api, parseApiResponse } from "@/lib/api/api";
import { replaceWorldResponseSchema, worldFileSchema } from "./world-schemas";

export const WORLD_DOWNLOAD_URL = "/api/v1/world/download";

export async function replaceWorld(file: File) {
  const parsedFile = worldFileSchema.parse(file);
  const data = await api.put("/api/v1/world", { body: parsedFile });
  return parseApiResponse(data, replaceWorldResponseSchema);
}
