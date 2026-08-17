import { z } from "zod";

export const backupSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().min(1).max(64),
  status: z.literal("ready"),
});

export const backupCatalogSchema = z.object({ backups: z.array(backupSchema) });
export const restoreBackupResponseSchema = z.object({ status: z.literal("restored") });

export type Backup = z.infer<typeof backupSchema>;
