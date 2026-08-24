import { queryOptions } from "@tanstack/react-query";
import { getSettings } from "./api/get-settings";

export const settingsKeys = {
  all: ["settings"] as const,
  detail: () => [...settingsKeys.all, "detail"] as const,
};

export function settingsQuery() {
  return queryOptions({
    queryKey: settingsKeys.detail(),
    queryFn: getSettings,
    // Keep the application default stale time. Settings has no polling or event stream;
    // the 5s provider policy owns route re-entry freshness.
  });
}
