export const auditKeys = {
  all: ["audit"] as const,
  catalog: () => [...auditKeys.all, "catalog"] as const,
};
