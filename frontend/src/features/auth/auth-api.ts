import { z } from "zod";
import { api, parseApiResponse } from "@/lib/api/api";
import { ApiError } from "@/lib/api/api-error";
import {
  loginCredentialsSchema,
  sessionSchema,
  setupCredentialsSchema,
  setupStatusSchema,
} from "./auth-schemas";
import type { AuthCredentials, Session } from "./auth-schemas";

export async function getSetupStatus() {
  const data = await api.get("/api/v1/setup");
  return parseApiResponse(data, setupStatusSchema);
}

export async function setup(credentials: AuthCredentials) {
  const body = setupCredentialsSchema.parse(credentials);
  const data = await api.post("/api/v1/setup", { body });
  return parseApiResponse(data, sessionSchema);
}

export async function login(credentials: AuthCredentials) {
  const body = loginCredentialsSchema.parse(credentials);
  const data = await api.post("/api/v1/auth/login", { body });
  return parseApiResponse(data, sessionSchema);
}

export async function getSession(): Promise<Session | null> {
  try {
    const data = await api.get("/api/v1/auth/session");
    return parseApiResponse(data, sessionSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function logout() {
  const data = await api.post("/api/v1/auth/logout");
  return parseApiResponse(data, z.undefined());
}
