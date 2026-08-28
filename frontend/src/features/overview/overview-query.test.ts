import { describe, expect, it } from "bun:test";
import { overviewQuery } from "./overview-query";

describe("overviewQuery", () => {
  it("polls every ten seconds and leaves stale time to the application default", () => {
    const options = overviewQuery();

    expect([...options.queryKey]).toEqual(["overview", "detail"]);
    expect(options.refetchInterval).toBe(10_000);
    expect(options).not.toHaveProperty("staleTime");
  });
});
