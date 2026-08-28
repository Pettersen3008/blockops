import { CircleUserRound, LogOut, ShieldCheck, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Button } from "@blockops/ui";
import { PRODUCT_NAME } from "@/config";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { serverStateTone } from "@/features/overview";
import type { ServerIdentity } from "@/features/overview";
import { isRoutedItem, navigation, navigationSections } from "@/app/routing/routes";
import type { NavigationEntry } from "@/app/routing/routes";
import { AppBrand } from "@/components/app-brand";

const sectionLabelClass = "mt-5 mb-1.5 px-2.5 text-[0.66rem] font-semibold tracking-[0.11em] text-muted-foreground uppercase";
const itemClass = "grid min-h-[34px] w-full grid-cols-[18px_1fr_auto] items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 text-left text-[0.83rem] font-medium no-underline [&>svg]:size-[16px]";
const dotTone = {
  good: "bg-primary",
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-input",
};

export function AppSidebar({
  session,
  server,
  open,
  signingOut,
  onClose,
  onSignOut,
}: {
  session: Session;
  server: ServerIdentity;
  open: boolean;
  signingOut: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <aside onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} className={`fixed inset-y-0 left-0 z-20 flex w-[240px] flex-col border-r border-border bg-sidebar px-3 pt-4 pb-3 max-[900px]:invisible max-[900px]:-translate-x-[102%] max-[900px]:shadow-[var(--shadow)] max-[900px]:transition-transform max-[900px]:duration-[180ms] ${open ? "max-[900px]:visible max-[900px]:translate-x-0" : ""}`}>
      <div className="flex min-h-[38px] items-center justify-between px-1.5">
        <AppBrand />
        {open ? <Button id="mobile-navigation-close" variant="ghost" className="size-[38px] min-w-[38px] p-0 min-[901px]:hidden" onClick={onClose} aria-label="Close navigation">
          <X aria-hidden="true" />
        </Button> : null}
      </div>

      <p className={sectionLabelClass}>Instances</p>
      <div className={`${itemClass} bg-accent text-foreground`} aria-current="true">
        <span className={`ml-[3px] size-2 rounded-full ${dotTone[serverStateTone(server.state)]}`} aria-hidden="true" />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">Minecraft server</span>
        <span className="text-[0.68rem] text-muted-foreground capitalize">{server.state}</span>
      </div>

      <nav aria-label="Primary navigation" className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {navigationSections.map((section) => (
          <div key={section.id}>
            <p className={sectionLabelClass}>{section.label}</p>
            <div className="grid gap-0.5">
              {navigation
                .filter((entry) => entry.section === section.id)
                .map((entry) => <SidebarItem key={entry.label} entry={entry} session={session} onNavigate={onClose} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-3 grid gap-1.5 border-t border-border pt-3">
        <div className="flex items-center gap-2.5 px-1.5">
          <CircleUserRound className="size-[22px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="grid min-w-0 gap-0.5">
            <strong className="overflow-hidden text-[0.83rem] text-ellipsis whitespace-nowrap">{session.user.username}</strong>
            <span className="text-[0.7rem] text-muted-foreground capitalize">{session.user.role}</span>
          </div>
        </div>
        <Button variant="ghost" className="justify-start" onClick={onSignOut} disabled={signingOut}>
          <LogOut aria-hidden="true" /> Sign out
        </Button>
      </div>
    </aside>
  );
}

function SidebarItem({
  entry,
  session,
  onNavigate,
}: {
  entry: NavigationEntry;
  session: Session;
  onNavigate: () => void;
}) {
  const Icon = entry.icon;

  if (!isRoutedItem(entry)) {
    return (
      <span className={`${itemClass} text-muted-foreground opacity-60`} aria-disabled="true">
        <Icon aria-hidden="true" />
        <span>{entry.label}</span>
        <span className="text-[0.68rem] font-normal">Soon</span>
      </span>
    );
  }

  const canOpen = hasPermission(session.user.role, entry.permission);
  return (
    <NavLink
      to={entry.path}
      className={({ isActive }) => `${itemClass} text-muted-foreground hover:bg-muted hover:text-foreground ${isActive ? "bg-accent text-foreground" : ""}`}
      aria-disabled={!canOpen}
      title={!canOpen ? `Requires additional ${PRODUCT_NAME} permissions` : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" />
      <span>{entry.label}</span>
      {!canOpen ? <ShieldCheck className="!size-[14px]" aria-hidden="true" /> : null}
    </NavLink>
  );
}
