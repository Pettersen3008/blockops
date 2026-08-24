import { useQuery } from "@tanstack/react-query";
import { usersQuery } from "../users-query";

export function useUsers() {
  return useQuery(usersQuery());
}
