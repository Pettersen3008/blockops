import { describe, expect, it } from "bun:test";
import { worldFileSchema } from "./world-schemas";

describe("world file metadata", () => {
  it("accepts a non-empty ZIP", () => {
    expect(worldFileSchema.safeParse(new File(["zip"], "world.zip", { type: "application/zip" })).success).toBe(true);
  });

  it("rejects empty, non-ZIP, and misleading files", () => {
    expect(worldFileSchema.safeParse(new File([], "world.zip", { type: "application/zip" })).success).toBe(false);
    expect(worldFileSchema.safeParse(new File(["data"], "world.txt", { type: "text/plain" })).success).toBe(false);
    expect(worldFileSchema.safeParse(new File(["data"], "world.zip", { type: "text/plain" })).success).toBe(false);
  });
});
