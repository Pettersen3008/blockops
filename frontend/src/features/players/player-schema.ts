import { z } from "zod";

/** Java usernames are ASCII by definition, so bytes and UTF-16 units agree here. */
export const MAX_NAME_LENGTH = 16;

/**
 * Go rejects `len(reason) > 160` — bytes, not characters
 * (backend/internal/operations/service.go). Validate the same unit or an accented
 * reason passes here and comes back as a 502.
 */
export const MAX_REASON_BYTES = 160;

// Module level: one allocation, not one per keystroke.
const utf8Encoder = new TextEncoder();
const utf8Length = (value: string) => utf8Encoder.encode(value).length;
const hasLineBreakOrNull = (value: string) => (
  value.includes("\r") || value.includes("\n") || value.includes("\0")
);

/** Mirrors Go's playerNamePattern: ^[A-Za-z0-9_]{1,16}$ */
export const playerNameSchema = z.string().regex(
  new RegExp(`^[A-Za-z0-9_]{1,${MAX_NAME_LENGTH}}$`),
  `Use a valid Java username with 1–${MAX_NAME_LENGTH} letters, numbers, or underscores.`,
);

const reasonSchema = z.string()
  .trim()
  // Requiring a reason is a frontend policy, not a backend rule: Go's optionalReason()
  // trims an empty reason and omits it from the RCON command. Do not relax this to
  // "match the backend" — the product decision is that a kick or ban is explained.
  .min(1, "Reason is required.")
  .refine(
    (reason) => utf8Length(reason) <= MAX_REASON_BYTES,
    `Reason must be at most ${MAX_REASON_BYTES} bytes — accents and emoji count as more than one.`,
  )
  .refine((reason) => !hasLineBreakOrNull(reason), "Reason cannot contain line breaks.");

export const playerSchema = z.object({
  name: playerNameSchema,
  uuid: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i).optional(),
  online: z.boolean(),
  allowlisted: z.boolean(),
  banned: z.boolean(),
  operator: z.boolean(),
});

export const playerCatalogSchema = z.object({ players: z.array(playerSchema) });

// The five actions Go validates a reason for but then ignores, and the two that forward
// it. `reason` is required on the wire for all seven: the handler decodes with
// DisallowUnknownFields and OpenAPI marks all three fields required.
const noReasonAction = <T extends "allowlist-add" | "allowlist-remove" | "pardon" | "op" | "deop">(action: T) => z.object({
  action: z.literal(action),
  name: playerNameSchema,
  reason: z.literal(""),
});

const reasonAction = <T extends "kick" | "ban">(action: T) => z.object({
  action: z.literal(action),
  name: playerNameSchema,
  reason: reasonSchema,
});

// Written out rather than derived from a table: z.discriminatedUnion needs a tuple, and
// building one from Object.entries() costs a cast that collapses the per-member
// `action: "kick"` literals every narrowing below depends on.
export const playerActionRequestSchema = z.discriminatedUnion("action", [
  noReasonAction("allowlist-add"),
  noReasonAction("allowlist-remove"),
  reasonAction("kick"),
  reasonAction("ban"),
  noReasonAction("pardon"),
  noReasonAction("op"),
  noReasonAction("deop"),
]);

export const playerActionResponseSchema = z.object({ response: z.string().max(16_384) });

export type Player = z.infer<typeof playerSchema>;
export type PlayerActionRequest = z.infer<typeof playerActionRequestSchema>;
export type PlayerAction = PlayerActionRequest["action"];
export type PendingPlayerAction = Pick<PlayerActionRequest, "action" | "name">;

/**
 * Derived from the union above, never re-listed. The reason-carrying members infer
 * `reason: string`, which is not assignable to `""`, so Extract drops them.
 */
export type NoReasonPlayerAction = Extract<PlayerActionRequest, { reason: "" }>["action"];
export type ReasonPlayerAction = Exclude<PlayerAction, NoReasonPlayerAction>;
