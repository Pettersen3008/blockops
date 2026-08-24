import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "../settings-query";

export function useSettings() {
  return useQuery(settingsQuery());
}
