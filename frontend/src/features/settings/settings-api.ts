import { userSchema } from "@/features/auth";
import { httpRequest } from "@/lib/api/http-client";
import {
  emptyResponseSchema,
  rconStatusSchema,
  settingsDataSchema,
  userCatalogSchema,
} from "./settings-schemas";
import type { CreateUserRequest, RconCredentials } from "./settings-schemas";

export const settingsApi = {
  get: () => httpRequest("/api/v1/settings", settingsDataSchema),
  updateRcon: (csrfToken: string, credentials: RconCredentials) => httpRequest(
    "/api/v1/settings/rcon",
    rconStatusSchema,
    { method: "PUT", body: JSON.stringify(credentials), csrfToken },
  ),
  users: () => httpRequest("/api/v1/users", userCatalogSchema),
  createUser: (csrfToken: string, input: CreateUserRequest) => httpRequest(
    "/api/v1/users",
    userSchema,
    { method: "POST", body: JSON.stringify(input), csrfToken },
  ),
  disableUser: (csrfToken: string, id: string) => httpRequest(
    `/api/v1/users/${encodeURIComponent(id)}`,
    emptyResponseSchema,
    { method: "DELETE", csrfToken },
  ),
  revokeSessions: (csrfToken: string, id: string) => httpRequest(
    `/api/v1/users/${encodeURIComponent(id)}/revoke-sessions`,
    emptyResponseSchema,
    { method: "POST", csrfToken },
  ),
};
