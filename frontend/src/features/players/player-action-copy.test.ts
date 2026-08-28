import { describe, expect, it } from "bun:test";
import { playerActionCopy } from "./player-action-copy";
import { playerActionRequestSchema } from "./player-schema";

const entries = Object.entries(playerActionCopy);

describe("player action copy", () => {
  it("agrees with the schema about which actions need a reason", () => {
    // The mapped type already makes a missing entry a compile error, so iterating the table
    // is exhaustive. This catches the other direction: an entry whose needsReason disagrees
    // with what its schema member actually accepts.
    for (const [action, copy] of entries) {
      const acceptsEmptyReason = playerActionRequestSchema.safeParse({
        action,
        name: "Steve",
        reason: "",
      }).success;

      expect(acceptsEmptyReason, action).toBe(!copy.needsReason);
    }
  });

  it("gives every action confirmation copy naming the player", () => {
    for (const [action, copy] of entries) {
      expect(copy.title("Steve"), action).toContain("Steve");
      expect(copy.description, action).not.toHaveLength(0);
      expect(copy.confirmLabel, action).not.toHaveLength(0);
    }
  });
});
