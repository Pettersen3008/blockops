import { describe, expect, it } from "vitest";
import { sessionSchema, setupCredentialsSchema } from "./auth-schemas";

describe("authentication schemas", () => {
  it("accepts the server session contract", () => {
    const parsed = sessionSchema.parse({
      user: {
        id: "user-1",
        username: "admin.user",
        role: "administrator",
        disabled: false,
        createdAt: "2026-08-17T12:00:00Z",
      },
      csrfToken: "csrf-token",
      expiresAt: "2026-08-18T00:00:00Z",
    });
    expect(parsed.user.role).toBe("administrator");
  });

  it("rejects malformed roles, dates, and setup passwords", () => {
    expect(sessionSchema.safeParse({
      user: { id: "1", username: "admin", role: "root", disabled: false, createdAt: "today" },
      csrfToken: "csrf",
      expiresAt: "later",
    }).success).toBe(false);
    expect(setupCredentialsSchema.safeParse({ username: "admin", password: "onlylowercase" }).success).toBe(false);
  });
});
