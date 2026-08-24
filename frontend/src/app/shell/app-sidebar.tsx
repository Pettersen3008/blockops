import { CircleUserRound, LogOut, ShieldCheck, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/config";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { navigation } from "@/app/routing/routes";
import { AppBrand } from "@/components/common/app-brand";

export function AppSidebar({
  session,
  open,
  signingOut,
  onClose,
  onSignOut,
}: {
  session: Session;
  open: boolean;
  signingOut: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-20 flex w-[264px] flex-col border-r border-border bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-4 pt-[22px] pb-[18px] backdrop-blur-[18px] max-[900px]:-translate-x-[102%] max-[900px]:shadow-[var(--shadow)] max-[900px]:transition-transform max-[900px]:duration-[180ms] ${open ? "max-[900px]:translate-x-0" : ""}`}>
      <div className="flex min-h-[52px] items-center justify-between px-[7px]">
        <AppBrand />
        <Button variant="ghost" className="size-[42px] min-w-[42px] p-0 min-[901px]:hidden" onClick={onClose} aria-label="Close navigation">
          <X aria-hidden="true" />
        </Button>
      </div>
      <nav aria-label="Primary navigation" className="mt-7 grid gap-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const canOpen = hasPermission(session.user.role, item.permission);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `grid min-h-[46px] w-full grid-cols-[22px_1fr_18px] items-center gap-2.5 rounded-[11px] border-0 bg-transparent px-3 text-left font-semibold text-muted-foreground no-underline hover:bg-muted hover:text-foreground [&>svg]:size-[19px] ${isActive ? "bg-accent text-primary" : ""}`}
              aria-disabled={!canOpen}
              title={!canOpen ? `Requires additional ${PRODUCT_NAME} permissions` : undefined}
              onClick={onClose}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
              {!canOpen ? <ShieldCheck className="!size-[15px] text-muted-foreground" aria-hidden="true" /> : null}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-2.5">
        <div className="flex min-h-16 items-center gap-2.5 rounded-xl border border-border bg-[var(--surface-raised)] p-2.5">
          <CircleUserRound className="w-[25px] text-primary-hover" aria-hidden="true" />
          <div className="grid min-w-0 gap-0.5"><strong className="overflow-hidden text-ellipsis">{session.user.username}</strong><span className="text-[0.72rem] text-muted-foreground capitalize">{session.user.role}</span></div>
        </div>
        <Button variant="ghost" className="justify-start" onClick={onSignOut} disabled={signingOut}>
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
