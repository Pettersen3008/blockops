import { useQuery } from "@tanstack/react-query";
import { playersQuery } from "../players-query";

export function usePlayers() {
  return useQuery(playersQuery());
}
