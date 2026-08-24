import { useQuery } from "@tanstack/react-query";
import { consoleHistoryQuery } from "../console-query";

export function useConsoleHistory() {
  return useQuery(consoleHistoryQuery());
}
