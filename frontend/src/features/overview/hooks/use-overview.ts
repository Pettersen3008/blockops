import { useQuery } from "@tanstack/react-query";
import { overviewQuery } from "../overview-query";

export function useOverview() {
  return useQuery(overviewQuery());
}
