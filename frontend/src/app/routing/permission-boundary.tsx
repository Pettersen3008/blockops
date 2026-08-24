import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { hasPermission } from "@/features/auth";
import type { Permission } from "@/features/auth";
import { useRouteSession } from "./use-route-session";

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
    <div className="flex min-h-[540px] flex-col items-center justify-center text-center">
      <ShieldCheck className="mb-5 size-11 text-warning" aria-hidden="true" />
      <p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Restricted area</p>
      <h1 className="mb-[14px]">{title}</h1>
      <p className="max-w-[560px] text-muted-foreground">Your dashboard role does not grant access to this section. Permissions are enforced by the API as well as this interface.</p>
    </div>
  );
}
