import { describe, expect, it } from "bun:test";
import { backupDownloadUrl } from "./api/backup-download-url";
import { backupCatalogSchema, backupSchema, restoreBackupResponseSchema } from "./backup-schema";

const backup = {
  id: "0123456789abcdef0123456789abcdef",
  sizeBytes: 1024,
  createdAt: "2026-08-17T12:00:00Z",
  createdBy: "admin",
  status: "ready" as const,
};

describe("backup contracts", () => {
  it("accepts the complete catalog and restore contracts", () => {
    expect(backupCatalogSchema.parse({ backups: [backup] })).toEqual({ backups: [backup] });
    expect(restoreBackupResponseSchema.parse({ status: "restored" })).toEqual({ status: "restored" });
  });

  it.each([
    ["unsafe identifier", { ...backup, id: "../world" }],
    ["uppercase identifier", { ...backup, id: "A".repeat(32) }],
    ["negative size", { ...backup, sizeBytes: -1 }],
    ["fractional size", { ...backup, sizeBytes: 1.5 }],
    ["unsafe integer size", { ...backup, sizeBytes: Number.MAX_SAFE_INTEGER + 1 }],
    ["invalid timestamp", { ...backup, createdAt: "today" }],
    ["empty creator", { ...backup, createdBy: "" }],
    ["oversized creator", { ...backup, createdBy: "a".repeat(65) }],
    ["unknown status", { ...backup, status: "creating" }],
  ])("rejects %s", (_name, value) => {
    expect(backupSchema.safeParse(value).success).toBe(false);
  });

  it("encodes download identifiers as one path segment", () => {
    expect(backupDownloadUrl("backup/id?#%"))
      .toBe("/api/v1/backups/backup%2Fid%3F%23%25/download");
  });
});
