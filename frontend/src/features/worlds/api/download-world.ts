import { serverPath } from "@/lib/api/server-path";

export function worldDownloadUrl(): string {
  // Native anchor navigation owns this GET download. It must not become query state.
  return serverPath("/world/download");
}
