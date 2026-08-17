import { describe, expect, it } from "vitest";
import { matchesAuditFilters, parseOutcomeFilter } from "./audit.filters";
import type { AuditEvent } from "./audit.schemas";

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

  it("matches outcome and case-insensitive event fields", () => {
    expect(matchesAuditFilters(event, "BACKUP", "success")).toBe(true);
    expect(matchesAuditFilters(event, "manual", "all")).toBe(true);
    expect(matchesAuditFilters(event, "admin", "failure")).toBe(false);
    expect(matchesAuditFilters(event, "missing", "all")).toBe(false);
  });
});
