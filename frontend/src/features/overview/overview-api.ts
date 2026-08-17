import { httpRequest } from "@/lib/api/http-client";
import {
  overviewSchema,
  serverActionResponseSchema,
  serverActionSchema,
} from "./overview-schemas";
import type { ServerAction } from "./overview-schemas";

export const overviewApi = {
  get: () => httpRequest("/api/v1/overview", overviewSchema),
  runServerAction: (csrfToken: string, action: ServerAction) => httpRequest(
    "/api/v1/server/actions",
    serverActionResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({ action: serverActionSchema.parse(action) }),
      csrfToken,
    },
  ),
};
