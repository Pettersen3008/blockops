import { ApiError } from "./api-error";

// ponytail: the one server a session addresses, mirroring configureCsrfToken.
// P2-06 makes the server a route parameter, and this module goes away with it.
let getServerId: () => string | undefined = () => undefined;

export function configureServerId(getter: () => string | undefined) {
  getServerId = getter;
}

export function serverPath(path: string): string {
  const serverId = getServerId();
  if (!serverId) throw new ApiError(0, "no_server", "BlockOps has no server selected.");

  return `/api/v1/servers/${encodeURIComponent(serverId)}${path}`;
}
