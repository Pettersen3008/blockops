import { z } from "zod";

const utf8Length = (value: string) => new TextEncoder().encode(value).length;
const hasLineBreakOrNull = (value: string) => (
  value.includes("\r") || value.includes("\n") || value.includes("\0")
);

export const playerNameSchema = z.string().regex(
  /^[A-Za-z0-9_]{1,16}$/,
  "Use a valid Java username with 1–16 letters, numbers, or underscores.",
);

const reasonSchema = z.string()
  .refine((reason) => utf8Length(reason) <= 160, "Reason must be at most 160 characters.")
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
