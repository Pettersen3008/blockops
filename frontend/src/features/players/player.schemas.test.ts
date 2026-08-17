import { describe, expect, it } from "vitest";
import { playerActionRequestSchema, playerCatalogSchema } from "./player.schemas";

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
    expect(playerActionRequestSchema.safeParse({ action: "op", name: "Steve", reason: "not allowed" }).success).toBe(false);
    expect(playerActionRequestSchema.safeParse({ action: "shell", name: "Steve", reason: "" }).success).toBe(false);
    expect(playerActionRequestSchema.safeParse({ action: "kick", name: "Steve", reason: "line one\nline two" }).success).toBe(false);
  });
});
