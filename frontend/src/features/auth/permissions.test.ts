import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("dashboard role policy", () => {
  it("keeps world replacement and restore administrator-only", () => {
    expect(hasPermission("administrator", "world.replace")).toBe(true);
    expect(hasPermission("operator", "world.replace")).toBe(false);
    expect(hasPermission("operator", "backups.restore")).toBe(false);
  });

  it("keeps viewers read-only and prevents backup downloads", () => {
    expect(hasPermission("viewer", "monitor.read")).toBe(true);
    expect(hasPermission("viewer", "backups.read")).toBe(true);
    expect(hasPermission("viewer", "backups.download")).toBe(false);
    expect(hasPermission("viewer", "console.execute")).toBe(false);
  });
});
