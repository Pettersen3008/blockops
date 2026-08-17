import { httpRequest } from "@/lib/api/httpClient";
import { replaceWorldResponseSchema, worldFileSchema } from "./world.schemas";

export const WORLD_DOWNLOAD_URL = "/api/v1/world/download";

export function replaceWorld(csrfToken: string, file: File) {
  const parsedFile = worldFileSchema.parse(file);
  return httpRequest(
    "/api/v1/world",
    replaceWorldResponseSchema,
    {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: parsedFile,
      csrfToken,
    },
  );
}
