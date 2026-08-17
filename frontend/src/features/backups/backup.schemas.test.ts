import { describe, expect, it } from "vitest";
import { backupCatalogSchema } from "./backup.schemas";
import { backupDownloadUrl } from "./backups.api";

const backup = {
  id: "0123456789abcdef0123456789abcdef",
  sizeBytes: 1024,
  createdAt: "2026-08-17T12:00:00Z",
  createdBy: "admin",
  status: "ready",
};

describe("backup contracts", () => {
  it("validates the catalog and rejects unsafe identifiers or statuses", () => {
    expect(backupCatalogSchema.safeParse({ backups: [backup] }).success).toBe(true);
    expect(backupCatalogSchema.safeParse({ backups: [{ ...backup, id: "../world", status: "unknown" }] }).success).toBe(false);
  });

  it("encodes download path segments", () => {
    expect(backupDownloadUrl("backup/id")).toBe("/api/v1/backups/backup%2Fid/download");
  });
});
