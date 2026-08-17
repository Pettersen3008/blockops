export const overviewKeys = {
  all: ["overview"] as const,
  detail: () => [...overviewKeys.all, "detail"] as const,
};
