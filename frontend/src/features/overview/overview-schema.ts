import { z } from "zod";
import { backupSchema } from "@/features/backups";

const boundedNumber = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const boundedInteger = boundedNumber.int();

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
  image: z.string().min(1).max(512).optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  uptimeSeconds: boundedInteger.optional(),
  version: z.string().min(1).max(128).optional(),
  software: z.string().min(1).max(128).optional(),
});

const serverMetricsSchema = z.object({
  cpuPercent: boundedNumber,
  memoryUsageBytes: boundedInteger,
  memoryLimitBytes: boundedInteger,
});

const diskMetricsSchema = z.object({
  usedBytes: boundedInteger,
  totalBytes: boundedInteger,
});

const playerSummarySchema = z.object({
  online: boundedInteger,
  max: boundedInteger,
  names: z.array(z.string().min(1).max(16)).max(100_000),
});

const warningLineSchema = z.object({
  sequence: boundedInteger,
  timestamp: z.iso.datetime({ offset: true }),
  text: z.string().min(1).max(16_384),
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
export const serverActionResponseSchema = z.object({
  status: z.enum(["start requested", "stop requested", "restart requested"]),
});

export type Overview = z.infer<typeof overviewSchema>;
export type ServerAction = z.infer<typeof serverActionSchema>;
export type ServerState = z.infer<typeof serverStateSchema>;
