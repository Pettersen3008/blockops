import { z } from "zod";
import { roleSchema, strongPasswordSchema, userSchema, usernameSchema } from "@/features/auth";

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const rconStatusSchema = z.object({
  address: z.string().max(512),
  configured: z.boolean(),
  source: z.string().min(1).max(128),
  credentialUpdatesEnabled: z.boolean(),
});

export const deploymentSettingsSchema = z.object({
  minecraftContainer: z.string().min(1).max(256),
  worldName: z.string().min(1).max(256),
  cookieSecure: z.boolean(),
  trustedProxyCount: z.number().int().nonnegative(),
  maxUploadBytes: z.number().int().positive().safe(),
});

export const settingsDataSchema = z.object({
  rcon: rconStatusSchema,
  deployment: deploymentSettingsSchema,
});

export const userCatalogSchema = z.object({ users: z.array(userSchema).max(1_000) });

export const createUserRequestSchema = z.object({
  username: usernameSchema,
  password: strongPasswordSchema,
  role: roleSchema,
});

export const rconCredentialsSchema = z.object({
  address: z.string()
    .trim()
    .min(1, "RCON address is required.")
    .max(512, "RCON address is too long.")
    .refine(isHostPort, "RCON address must use host:port format."),
  password: z.string()
    .refine((value) => utf8Length(value) >= 8, "RCON password must be at least 8 characters.")
    .refine((value) => utf8Length(value) <= 256, "RCON password must be at most 256 characters."),
});

export const emptyResponseSchema = z.undefined();

export type SettingsData = z.infer<typeof settingsDataSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type RconCredentials = z.infer<typeof rconCredentialsSchema>;

function isHostPort(value: string): boolean {
  if (/\s/u.test(value)) return false;
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    return closingBracket > 1 && value[closingBracket + 1] === ":" && closingBracket + 2 < value.length;
  }
  const separator = value.lastIndexOf(":");
  return separator > 0 && separator < value.length - 1 && !value.slice(0, separator).includes(":");
}
