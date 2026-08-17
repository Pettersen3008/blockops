export const authKeys = {
  all: ["auth"] as const,
  setup: () => [...authKeys.all, "setup"] as const,
  session: () => [...authKeys.all, "session"] as const,
};
