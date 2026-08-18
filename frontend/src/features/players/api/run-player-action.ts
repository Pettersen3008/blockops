import { api, parseApiResponse } from "@/lib/api/api";
import { playerActionResponseSchema } from "../player-schema";
import type { PlayerActionRequest } from "../player-schema";

export async function runPlayerAction(request: PlayerActionRequest) {
  // Go decodes with DisallowUnknownFields and OpenAPI marks all three fields required, so
  // exactly these keys go on the wire — no more, no fewer.
  //
  // The argument is already this schema's parse output and an outbound body is not a trust
  // boundary, so re-parsing here bought nothing: it could only turn a caller bug into a raw
  // ZodError, which safeErrorMessage has no case for and renders as "Something went wrong."
  const body = { action: request.action, name: request.name, reason: request.reason };
  const data = await api.post("/api/v1/players/actions", { body });

  return parseApiResponse(data, playerActionResponseSchema);
}
