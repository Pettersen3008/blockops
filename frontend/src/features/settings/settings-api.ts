import { userSchema } from "@/features/auth";
import { api, parseApiResponse } from "@/lib/api/api";
import {
  emptyResponseSchema,
  rconStatusSchema,
  settingsDataSchema,
  userCatalogSchema,
} from "./settings-schemas";
import type { CreateUserRequest, RconCredentials } from "./settings-schemas";

export async function getSettings() {
  const data = await api.get("/api/v1/settings");
  return parseApiResponse(data, settingsDataSchema);
}

export async function updateRcon(credentials: RconCredentials) {
  const data = await api.put("/api/v1/settings/rcon", { body: credentials });
  return parseApiResponse(data, rconStatusSchema);
}

export async function getUsers() {
  const data = await api.get("/api/v1/users");
  return parseApiResponse(data, userCatalogSchema);
}

export async function createUser(input: CreateUserRequest) {
  const data = await api.post("/api/v1/users", { body: input });
  return parseApiResponse(data, userSchema);
}

export async function disableUser(id: string) {
  const data = await api.delete(`/api/v1/users/${encodeURIComponent(id)}`);
  return parseApiResponse(data, emptyResponseSchema);
}

export async function revokeSessions(id: string) {
  const data = await api.post(`/api/v1/users/${encodeURIComponent(id)}/revoke-sessions`);
  return parseApiResponse(data, emptyResponseSchema);
}
