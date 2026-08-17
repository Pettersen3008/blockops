import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { hasPermission } from "@/features/auth";
import type { Permission } from "@/features/auth";
import { useRouteSession } from "./useRouteSession";

export function PermissionBoundary({
  permission,
  title,
  children,
}: {
  permission: Permission;
  title: string;
  children: ReactNode;
}) {
  const session = useRouteSession();
  if (hasPermission(session.user.role, permission)) return children;

  return (
    <div className="restricted-page">
      <ShieldCheck aria-hidden="true" />
      <p className="eyebrow">Restricted area</p>
      <h1>{title}</h1>
      <p>Your dashboard role does not grant access to this section. Permissions are enforced by the API as well as this interface.</p>
    </div>
  );
}
