import { z } from "zod";

export const backupSchema = z.object({
  id: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().min(1),
  status: z.string().min(1).max(64),
});

export type Backup = z.infer<typeof backupSchema>;
