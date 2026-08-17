import { AuditPage } from "@/features/audit";
import { PermissionBoundary } from "../permission-boundary";

export function Component() {
  return (
    <PermissionBoundary permission="audit.read" title="Audit log">
      <AuditPage />
    </PermissionBoundary>
  );
}
