export const playerKeys = {
  all: ["players"] as const,
  catalog: () => [...playerKeys.all, "catalog"] as const,
};
