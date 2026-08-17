import { describe, expect, it } from "vitest";
import { auditCatalogSchema } from "./audit.schemas";

const event = {
  id: "0123456789abcdef0123456789abcdef",
  occurredAt: "2026-08-17T12:00:00Z",
  username: "admin",
  action: "auth.setup",
  target: "admin",
  sourceIp: "127.0.0.1",
  outcome: "success",
  details: { role: "administrator" },
};

describe("audit schemas", () => {
  it("accepts the bounded audit catalog contract", () => {
    expect(auditCatalogSchema.safeParse({ events: [event] }).success).toBe(true);
  });

  it("rejects malformed identifiers, outcomes, and oversized catalogs", () => {
    expect(auditCatalogSchema.safeParse({ events: [{ ...event, id: "unsafe/id" }] }).success).toBe(false);
    expect(auditCatalogSchema.safeParse({ events: [{ ...event, outcome: "unknown" }] }).success).toBe(false);
    expect(auditCatalogSchema.safeParse({ events: Array.from({ length: 201 }, () => event) }).success).toBe(false);
  });
});
