export const consoleKeys = {
  all: ["console"] as const,
  history: () => [...consoleKeys.all, "history"] as const,
};
