import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "@/api";
import { useRouteSession } from "@/App/routing/useRouteSession";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export function AppShell() {
  const session = useRouteSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.logout(session.csrfToken),
    onSettled: () => {
      queryClient.clear();
      window.history.replaceState({}, "", "/overview");
      window.location.reload();
    },
  });

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
