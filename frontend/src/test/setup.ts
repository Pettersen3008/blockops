import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
import { setupServer } from "msw/node";

export const server = setupServer();

expect.extend(matchers);

// Bun runs every test file in one process, so a shared jsdom drifts past the 1s default.
configure({ asyncUtilTimeout: 5_000 });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
