export const settingsKeys = {
  all: ["settings"] as const,
  detail: () => [...settingsKeys.all, "detail"] as const,
};

export const userKeys = {
  all: ["users"] as const,
  catalog: () => [...userKeys.all, "catalog"] as const,
};
