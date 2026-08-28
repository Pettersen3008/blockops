import { describe, expect, it } from "bun:test";
import { playerActionRequestSchema, playerCatalogSchema } from "./player-schema";

const player = {
  name: "Steve",
  online: true,
  allowlisted: true,
  banned: false,
  operator: false,
};

describe("player contracts", () => {
  it("validates player catalogs", () => {
    expect(playerCatalogSchema.safeParse({ players: [player] }).success).toBe(true);
    expect(playerCatalogSchema.safeParse({ players: [{ ...player, name: "invalid player" }] }).success).toBe(false);
  });

  it("uses a discriminated action union with bounded reasons", () => {
    expect(playerActionRequestSchema.safeParse({ action: "ban", name: "Steve", reason: "Repeated griefing" }).success).toBe(true);
    expect(playerActionRequestSchema.safeParse({ action: "kick", name: "Steve", reason: "" }).success).toBe(false);
    expect(playerActionRequestSchema.safeParse({ action: "ban", name: "Steve", reason: "   " }).success).toBe(false);
    expect(playerActionRequestSchema.safeParse({ action: "op", name: "Steve", reason: "not allowed" }).success).toBe(false);
    expect(playerActionRequestSchema.safeParse({ action: "shell", name: "Steve", reason: "" }).success).toBe(false);
    expect(playerActionRequestSchema.safeParse({ action: "kick", name: "Steve", reason: "line one\nline two" }).success).toBe(false);
  });
  it("caps the reason in UTF-8 bytes, the unit the Go handler measures", () => {
    const accepts = (reason: string) => (
      playerActionRequestSchema.safeParse({ action: "ban", name: "Steve", reason }).success
    );

    expect(accepts("a".repeat(160))).toBe(true);
    expect(accepts("a".repeat(161))).toBe(false);
    // "é" is two bytes, so 80 of them sit exactly on the cap.
    expect(accepts("é".repeat(80))).toBe(true);
    expect(accepts("é".repeat(81))).toBe(false);
    // "😀" is four bytes but two UTF-16 units, so 40 of them are 160 bytes and only 80
    // units. These two are what pin the cap to bytes rather than string length.
    expect(accepts("😀".repeat(40))).toBe(true);
    expect(accepts("😀".repeat(41))).toBe(false);
  });
});
