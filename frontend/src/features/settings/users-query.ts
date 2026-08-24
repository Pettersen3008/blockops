import { queryOptions } from "@tanstack/react-query";
import { getUsers } from "./api/get-users";

export const userKeys = {
  all: ["users"] as const,
  catalog: () => [...userKeys.all, "catalog"] as const,
};

export function usersQuery() {
  return queryOptions({
    queryKey: userKeys.catalog(),
    queryFn: getUsers,
    // Keep the application default stale time. User administration has no live stream;
    // successful mutations invalidate this and all other cached server views.
  });
}
