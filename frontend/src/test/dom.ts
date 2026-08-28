import { JSDOM } from "jsdom";

// Bun has no built-in DOM. jsdom matches the environment the suite was written against;
// happy-dom's MutationObserver deadlocks Testing Library's waitFor on Base UI dialog close.
const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost",
});

const globals = globalThis as unknown as Record<string, unknown>;
globals.window = window;
globals.document = window.document;
for (const key of Object.getOwnPropertyNames(window)) {
  // Bun's fetch/Request/Response carry MSW's interceptors; jsdom's own copies would break them.
  if (key in globals || key.startsWith("_")) continue;
  globals[key] = window[key as keyof typeof window];
}

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
}
