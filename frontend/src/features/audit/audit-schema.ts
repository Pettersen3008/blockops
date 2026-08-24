import { z } from "zod";

export const auditOutcomeSchema = z.enum(["success", "failure", "denied"]);
export const auditOutcomeFilterSchema = z.enum(["all", "success", "failure", "denied"]);

export const auditEventSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/),
  occurredAt: z.iso.datetime({ offset: true }),
  userId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  username: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(128),
  target: z.string().max(512),
  sourceIp: z.string().min(1).max(128),
  outcome: auditOutcomeSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export const auditCatalogSchema = z.object({ events: z.array(auditEventSchema).max(200) });

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditOutcomeFilter = z.infer<typeof auditOutcomeFilterSchema>;
