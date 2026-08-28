import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useRouteSession } from "@/app/routing/use-route-session";
import { useLogoutMutation } from "@/features/auth";
import { useServerIdentity } from "@/features/overview";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell() {
  const session = useRouteSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const logout = useLogoutMutation();
  const server = useServerIdentity();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <AppSidebar
        session={session}
        server={server}
        open={menuOpen}
        signingOut={logout.isPending}
        onClose={() => setMenuOpen(false)}
        onSignOut={() => logout.mutate()}
      />
      {menuOpen ? <button className="fixed inset-0 z-[15] border-0 bg-[rgba(4,8,5,.48)] min-[901px]:hidden" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /> : null}
      <div className="min-h-screen ml-[240px] max-[900px]:ml-0">
        <AppHeader server={server} onOpenNavigation={() => setMenuOpen(true)} />
        <main id="main-content" className="mx-auto w-full max-w-[1360px] px-[clamp(20px,3vw,40px)] pt-7 pb-14 max-[900px]:px-4 max-[900px]:pt-6 max-[900px]:pb-12">
          <Outlet context={session} />
        </main>
      </div>
    </div>
  );
}
