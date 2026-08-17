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
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand-row">
        <AppBrand />
        <Button variant="ghost" className="icon-button sidebar__close" onClick={onClose} aria-label="Close navigation">
          <X aria-hidden="true" />
        </Button>
      </div>
      <nav aria-label="Primary navigation" className="nav-list">
        {navigation.map((item) => {
          const Icon = item.icon;
          const canOpen = hasPermission(session.user.role, item.permission);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
              aria-disabled={!canOpen}
              title={!canOpen ? `Requires additional ${PRODUCT_NAME} permissions` : undefined}
              onClick={onClose}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
              {!canOpen ? <ShieldCheck className="nav-item__lock" aria-hidden="true" /> : null}
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <div className="user-chip">
          <CircleUserRound aria-hidden="true" />
          <div><strong>{session.user.username}</strong><span>{session.user.role}</span></div>
        </div>
        <Button variant="ghost" onClick={onSignOut} disabled={signingOut}>
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
