import { z } from "zod";
import { backupSchema } from "@/features/backups";

function availableSchema<T extends z.ZodType>(valueSchema: T) {
  return z.discriminatedUnion("available", [
    z.object({
      available: z.literal(true),
      value: valueSchema,
      message: z.string().max(240).optional(),
    }),
    z.object({
      available: z.literal(false),
      message: z.string().max(240).optional(),
      value: z.undefined().optional(),
    }),
  ]);
}

export const serverStateSchema = z.enum(["online", "offline", "starting", "stopping", "unknown"]);

const serverInfoSchema = z.object({
  state: serverStateSchema,
  image: z.string().max(512).optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  uptimeSeconds: z.number().int().nonnegative().optional(),
  version: z.string().max(128).optional(),
  software: z.string().max(128).optional(),
});

const serverMetricsSchema = z.object({
  cpuPercent: z.number().nonnegative(),
  memoryUsageBytes: z.number().nonnegative(),
  memoryLimitBytes: z.number().nonnegative(),
});

const diskMetricsSchema = z.object({
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
});

const playerSummarySchema = z.object({
  online: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  names: z.array(z.string().min(1).max(64)),
});

const warningLineSchema = z.object({
  sequence: z.number().int().nonnegative(),
  timestamp: z.iso.datetime({ offset: true }),
  text: z.string().max(16_384),
});

export const overviewSchema = z.object({
  server: availableSchema(serverInfoSchema),
  metrics: availableSchema(serverMetricsSchema),
  disk: availableSchema(diskMetricsSchema),
  players: availableSchema(playerSummarySchema),
  recentWarnings: z.array(warningLineSchema).max(5),
  lastSuccessfulBackup: backupSchema.optional(),
});

export const serverActionSchema = z.enum(["start", "stop", "restart"]);
export const serverActionResponseSchema = z.object({ status: z.string().min(1).max(64) });

export type OverviewData = z.infer<typeof overviewSchema>;
export type ServerAction = z.infer<typeof serverActionSchema>;
export type ServerState = z.infer<typeof serverStateSchema>;
