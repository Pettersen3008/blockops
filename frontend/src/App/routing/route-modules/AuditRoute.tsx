import { AuditPage } from "@/pages/AuditPage";
import { PermissionBoundary } from "../PermissionBoundary";

export function Component() {
  return (
    <PermissionBoundary permission="audit.read" title="Audit log">
      <AuditPage />
    </PermissionBoundary>
  );
}
