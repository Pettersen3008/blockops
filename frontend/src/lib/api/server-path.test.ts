import { afterEach, describe, expect, it } from "bun:test";
import { ApiError } from "./api-error";
import { configureServerId, serverPath } from "./server-path";

afterEach(() => configureServerId(() => "test-server"));

describe("serverPath", () => {
  it("given no configured server, when building a scoped path, then refuses instead of addressing one", () => {
    configureServerId(() => undefined);

    expect(() => serverPath("/players")).toThrow(ApiError);
  });
});
