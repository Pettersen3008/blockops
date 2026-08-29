import { describe, expect, it } from "bun:test";
import { auditFilterSearchParams, hasAuditFilters, parseAuditSearchParams, parseOutcomeFilter } from "./audit-filters";

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

  it("serializes the server filters and reports whether one is active", () => {
    const filters = { query: "backup", outcome: "failure" } as const;
    expect(auditFilterSearchParams(filters).toString()).toBe("q=backup&outcome=failure");
    expect(hasAuditFilters(filters)).toBe(true);
    expect(hasAuditFilters({ query: " ", outcome: "all" })).toBe(false);
  });
});
