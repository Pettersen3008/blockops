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
  const logout = useLogoutMutation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <AppSidebar
        session={session}
        open={menuOpen}
        signingOut={logout.isPending}
        onClose={() => setMenuOpen(false)}
        onSignOut={() => logout.mutate()}
      />
      {menuOpen ? <button className="fixed inset-0 z-[15] border-0 bg-[rgba(4,8,5,.48)] min-[901px]:hidden" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /> : null}
      <div className="min-h-screen ml-[264px] max-[900px]:ml-0">
        <AppHeader onOpenNavigation={() => setMenuOpen(true)} />
        <main id="main-content" className="mx-auto w-full max-w-[1480px] px-[clamp(24px,4vw,64px)] pt-10 pb-[72px] max-[900px]:px-5 max-[900px]:pt-[30px] max-[900px]:pb-[60px]">
          <Outlet context={session} />
        </main>
      </div>
    </div>
  );
}
