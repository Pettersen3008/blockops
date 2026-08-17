import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useRouteSession } from "@/app/routing/use-route-session";
import { useLogoutMutation } from "@/features/auth";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell() {
  const session = useRouteSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const logout = useLogoutMutation(session.csrfToken);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <AppSidebar
        session={session}
        open={menuOpen}
        signingOut={logout.isPending}
        onClose={() => setMenuOpen(false)}
        onSignOut={() => logout.mutate()}
      />
      {menuOpen ? <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /> : null}
      <div className="app-main">
        <AppHeader onOpenNavigation={() => setMenuOpen(true)} />
        <main id="main-content" className="page-content">
          <Outlet context={session} />
        </main>
      </div>
    </div>
  );
}
