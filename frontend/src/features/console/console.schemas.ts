import { z } from "zod";

const utf8Length = (value: string) => new TextEncoder().encode(value).length;
const hasLineBreakOrNull = (value: string) => (
  value.includes("\r") || value.includes("\n") || value.includes("\0")
);

export const consoleLineSchema = z.object({
  sequence: z.number().int().nonnegative().safe(),
  timestamp: z.iso.datetime({ offset: true }),
  text: z.string().max(8_193),
});

export const consoleHistorySchema = z.object({ lines: z.array(consoleLineSchema).max(1_000) });

export const consoleCommandSchema = z.string()
  .refine((value) => !hasLineBreakOrNull(value), "Command cannot contain line breaks.")
  .transform((value) => value.trim())
  .refine((value) => utf8Length(value) >= 1, "Command is required.")
  .refine((value) => utf8Length(value) <= 4_096, "Command must be at most 4,096 bytes.");

export const consoleCommandResponseSchema = z.object({ response: z.string().max(65_536) });

export type ConsoleLine = z.infer<typeof consoleLineSchema>;
