import { describe, expect, it } from "bun:test";
import { auditPageSchema } from "./audit-schema";

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

describe("audit schema", () => {
  it("accepts the bounded audit catalog contract", () => {
    expect(auditPageSchema.safeParse({ events: [event], nextCursor: null }).success).toBe(true);
  });

  it("rejects malformed identifiers, outcomes, and oversized catalogs", () => {
    expect(auditPageSchema.safeParse({ events: [{ ...event, id: "unsafe/id" }], nextCursor: null }).success).toBe(false);
    expect(auditPageSchema.safeParse({ events: [{ ...event, outcome: "unknown" }], nextCursor: null }).success).toBe(false);
    expect(auditPageSchema.safeParse({ events: Array.from({ length: 501 }, () => event), nextCursor: null }).success).toBe(false);
    expect(auditPageSchema.safeParse({ events: [event] }).success).toBe(false);
  });
});
