import { userSchema } from "@/features/auth";
import { api, parseApiResponse } from "@/lib/api/api";
import type { CreateUserRequest } from "../settings-schema";

export async function createUser(input: CreateUserRequest) {
  const data = await api.post("/api/v1/fleet/users", { body: input });

  return parseApiResponse(data, userSchema);
}
