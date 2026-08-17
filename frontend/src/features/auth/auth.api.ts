import { z } from "zod";
import { ApiError } from "@/lib/api/ApiError";
import { httpRequest } from "@/lib/api/httpClient";
import {
  loginCredentialsSchema,
  sessionSchema,
  setupCredentialsSchema,
  setupStatusSchema,
} from "./auth.schemas";
import type { AuthCredentials, Session } from "./auth.schemas";

export const authApi = {
  setupStatus: () => httpRequest("/api/v1/setup", setupStatusSchema),
  setup: (credentials: AuthCredentials) => httpRequest(
    "/api/v1/setup",
    sessionSchema,
    { method: "POST", body: JSON.stringify(setupCredentialsSchema.parse(credentials)) },
  ),
  login: (credentials: AuthCredentials) => httpRequest(
    "/api/v1/auth/login",
    sessionSchema,
    { method: "POST", body: JSON.stringify(loginCredentialsSchema.parse(credentials)) },
  ),
  session: async (): Promise<Session | null> => {
    try {
      return await httpRequest("/api/v1/auth/session", sessionSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  logout: (csrfToken: string) => httpRequest(
    "/api/v1/auth/logout",
    z.undefined(),
    { method: "POST", csrfToken },
  ),
};
