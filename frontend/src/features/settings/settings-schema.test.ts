import { describe, expect, it } from "vitest";
import { createUserRequestSchema, rconCredentialsSchema, settingsDataSchema } from "./settings-schema";

const settings = {
  rcon: { address: "minecraft:25575", configured: true, source: "environment", credentialUpdatesEnabled: true },
  deployment: { minecraftContainer: "minecraft", worldName: "world", cookieSecure: true, trustedProxyCount: 1, maxUploadBytes: 1024 },
};

describe("settings schemas", () => {
  it("validates settings and RCON host:port credentials", () => {
    expect(settingsDataSchema.safeParse(settings).success).toBe(true);
    expect(rconCredentialsSchema.safeParse({ address: "minecraft:25575", password: "secret-pass" }).success).toBe(true);
    expect(rconCredentialsSchema.safeParse({ address: "[::1]:25575", password: "secret-pass" }).success).toBe(true);
    expect(rconCredentialsSchema.safeParse({ address: "minecraft", password: "short" }).success).toBe(false);
  });

  it("uses the shared strong-password and role contracts for new users", () => {
    expect(createUserRequestSchema.safeParse({ username: "new-user", password: "Strong passphrase 42!", role: "viewer" }).success).toBe(true);
    expect(createUserRequestSchema.safeParse({ username: "x", password: "weak", role: "owner" }).success).toBe(false);
  });

  it("rejects unsafe deployment values", () => {
    expect(settingsDataSchema.safeParse({
      ...settings,
      deployment: { ...settings.deployment, maxUploadBytes: -1 },
    }).success).toBe(false);
  });
});
