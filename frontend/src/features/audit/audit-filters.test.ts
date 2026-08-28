import { describe, expect, it } from "bun:test";
import { matchesAuditFilters, parseAuditSearchParams, parseOutcomeFilter } from "./audit-filters";
import type { AuditEvent } from "./audit-schema";

const event: AuditEvent = {
  id: "0123456789abcdef0123456789abcdef",
  occurredAt: "2026-08-17T12:00:00Z",
  username: "Admin",
  action: "backup.create",
  target: "world",
  sourceIp: "127.0.0.1",
  outcome: "success",
  details: { reason: "manual" },
};

describe("audit filters", () => {
  it("normalizes absent and invalid outcomes to all", () => {
    expect(parseOutcomeFilter(null)).toBe("all");
    expect(parseOutcomeFilter("unexpected")).toBe("all");
    expect(parseOutcomeFilter("denied")).toBe("denied");
  });

  it("parses every URL value before use", () => {
    expect(parseAuditSearchParams(new URLSearchParams("q=Admin&outcome=denied"))).toEqual({
      query: "Admin",
      outcome: "denied",
    });
    expect(parseAuditSearchParams(new URLSearchParams("outcome=not-an-outcome"))).toEqual({
      query: "",
      outcome: "all",
    });
  });

  it("matches outcome and case-insensitive event fields", () => {
    expect(matchesAuditFilters(event, "BACKUP", "success")).toBe(true);
    expect(matchesAuditFilters(event, "manual", "all")).toBe(true);
    expect(matchesAuditFilters(event, "admin", "failure")).toBe(false);
    expect(matchesAuditFilters(event, "missing", "all")).toBe(false);
  });
});
