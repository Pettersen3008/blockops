import { describe, expect, it } from "vitest";
import { confirmationFor } from "./overview-actions";

describe("overview confirmations", () => {
  it.each([
    ["backup", "Create backup"],
    ["start", "Start server"],
    ["stop", "Stop server"],
    ["restart", "Restart server"],
  ] as const)("maps %s to stable confirmation copy", (action, label) => {
    expect(confirmationFor(action).label).toBe(label);
  });
});
