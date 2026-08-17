import {
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Boxes,
  ChevronRight,
  CircleUserRound,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, errorMessage } from "@/api";
import { Button, Field, LoadingState, Notice } from "@/components/ui";
import { PRODUCT_NAME } from "@/config";
import { AuditPage } from "@/pages/AuditPage";
import { BackupsPage } from "@/pages/BackupsPage";
import { ConsolePage } from "@/pages/ConsolePage";
import { OverviewPage } from "@/pages/OverviewPage";
import { PlayersPage } from "@/pages/PlayersPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WorldsPage } from "@/pages/WorldsPage";
import type { Permission, Session } from "@/types";
import { hasPermission } from "@/types";
import { useTheme } from "@/App/providers/ThemeProvider";

type RouteKey = "overview" | "console" | "players" | "worlds" | "backups" | "audit" | "settings";

interface NavigationItem {
  key: RouteKey;
  label: string;
  permission: Permission;
  icon: LucideIcon;
}

const navigation: NavigationItem[] = [
  { key: "overview", label: "Overview", permission: "monitor.read", icon: LayoutDashboard },
  { key: "console", label: "Console", permission: "console.read", icon: Command },
  { key: "players", label: "Players", permission: "players.read", icon: UsersRound },
  { key: "worlds", label: "Worlds", permission: "world.download", icon: Boxes },
  { key: "backups", label: "Backups", permission: "backups.read", icon: Archive },
  { key: "audit", label: "Audit log", permission: "audit.read", icon: ScrollText },
  { key: "settings", label: "Settings", permission: "settings.manage", icon: Settings },
];

function routeFromPath(): RouteKey {
  const candidate = window.location.pathname.split("/").filter(Boolean)[0];
  return navigation.some((item) => item.key === candidate) ? (candidate as RouteKey) : "overview";
}

function useRoute() {
  const [route, setRoute] = useState<RouteKey>(routeFromPath);
  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const navigate = (next: RouteKey) => {
    window.history.pushState({}, "", `/${next}`);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return [route, navigate] as const;
}

export function Application() {
  const queryClient = useQueryClient();
  const setup = useQuery({ queryKey: ["setup"], queryFn: api.setupStatus, staleTime: Infinity });
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    enabled: setup.data?.required === false,
    retry: false,
    staleTime: 60_000,
  });

  const onAuthenticated = (value: Session) => {
    queryClient.setQueryData(["setup"], { required: false });
    queryClient.setQueryData(["session"], value);
  };

  if (setup.isLoading || (setup.data?.required === false && session.isLoading)) {
    return <FullScreenState><LoadingState label={`Starting ${PRODUCT_NAME}`} /></FullScreenState>;
  }
  if (setup.isError) {
    return (
      <FullScreenState>
        <Notice tone="danger">{errorMessage(setup.error)} Check that the BlockOps API is running.</Notice>
      </FullScreenState>
    );
  }
  if (setup.data?.required) return <SetupScreen onAuthenticated={onAuthenticated} />;
  if (session.isError) {
    return (
      <FullScreenState>
        <Notice tone="danger">{errorMessage(session.error)}</Notice>
        <Button onClick={() => void session.refetch()}>Try again</Button>
      </FullScreenState>
    );
  }
  if (!session.data) return <LoginScreen onAuthenticated={onAuthenticated} />;
  return <Dashboard session={session.data} />;
}

function Dashboard({ session }: { session: Session }) {
  const [route, navigate] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api.logout(session.csrfToken),
    onSettled: () => {
      queryClient.clear();
      window.history.replaceState({}, "", "/overview");
      window.location.reload();
    },
  });

  const selected = navigation.find((item) => item.key === route) ?? navigation[0]!;
  const allowed = hasPermission(session.user.role, selected.permission);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <div className="brand-row">
          <Brand />
          <Button variant="ghost" className="icon-button sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Close navigation">
            <X aria-hidden="true" />
          </Button>
        </div>
        <nav aria-label="Primary navigation" className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const canOpen = hasPermission(session.user.role, item.permission);
            return (
              <button
                key={item.key}
                className={`nav-item ${route === item.key ? "nav-item--active" : ""}`}
                aria-current={route === item.key ? "page" : undefined}
                aria-disabled={!canOpen}
                title={!canOpen ? `Requires additional ${PRODUCT_NAME} permissions` : undefined}
                onClick={() => {
                  navigate(item.key);
                  setMenuOpen(false);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {!canOpen ? <ShieldCheck className="nav-item__lock" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <div className="user-chip">
            <CircleUserRound aria-hidden="true" />
            <div><strong>{session.user.username}</strong><span>{session.user.role}</span></div>
          </div>
          <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut aria-hidden="true" /> Sign out
          </Button>
        </div>
      </aside>
      {menuOpen ? <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /> : null}
      <div className="app-main">
        <header className="topbar">
          <Button variant="ghost" className="icon-button topbar__menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </Button>
          <div className="breadcrumb"><span>Single server</span><ChevronRight aria-hidden="true" /><strong>{selected.label}</strong></div>
          <Button
            variant="ghost"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>
        </header>
        <main id="main-content" className="page-content">
          {allowed ? renderPage(route, session) : <RestrictedPage title={selected.label} />}
        </main>
      </div>
    </div>
  );
}

function renderPage(route: RouteKey, session: Session) {
  switch (route) {
    case "overview": return <OverviewPage session={session} />;
    case "console": return <ConsolePage session={session} />;
    case "players": return <PlayersPage session={session} />;
    case "worlds": return <WorldsPage session={session} />;
    case "backups": return <BackupsPage session={session} />;
    case "audit": return <AuditPage />;
    case "settings": return <SettingsPage session={session} />;
  }
}

function RestrictedPage({ title }: { title: string }) {
  return (
    <div className="restricted-page">
      <ShieldCheck aria-hidden="true" />
      <p className="eyebrow">Restricted area</p>
      <h1>{title}</h1>
      <p>Your dashboard role does not grant access to this section. Permissions are enforced by the API as well as this interface.</p>
    </div>
  );
}

function SetupScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  return (
    <AuthScreen
      eyebrow="Secure first run"
      title="Create the first administrator"
      description="No default credentials exist. This account will control users, worlds, restores, and integration settings."
      submitLabel="Create administrator"
      onSubmit={async (username, password) => onAuthenticated(await api.setup(username, password))}
      setup
    />
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  return (
    <AuthScreen
      eyebrow="Private control plane"
      title="Welcome back"
      description="Sign in to monitor and operate the configured Minecraft server."
      submitLabel="Sign in"
      onSubmit={async (username, password) => onAuthenticated(await api.login(username, password))}
    />
  );
}

function AuthScreen({
  eyebrow,
  title,
  description,
  submitLabel,
  onSubmit,
  setup = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (username: string, password: string) => Promise<void>;
  setup?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({ mutationFn: () => onSubmit(username, password) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <Brand />
        <div className="auth-intro__copy">
          <span className="signal-mark"><span /><span /><span /></span>
          <h2>Operate the world.<br />Not the host.</h2>
          <p>A deliberately narrow dashboard for one Minecraft server, with audited actions and no browser shell.</p>
        </div>
        <p className="auth-intro__foot">Designed for private networks and trusted HTTPS proxies.</p>
      </section>
      <main className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-form__description">{description}</p>
          {mutation.isError ? <Notice tone="danger">{errorMessage(mutation.error)}</Notice> : null}
          <Field label="Username" htmlFor="username" hint={setup ? "3–32 letters, numbers, dot, underscore, or hyphen." : undefined}>
            <input id="username" name="username" autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password" hint={setup ? "At least 12 characters using three character categories." : undefined}>
            <input id="password" name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} required minLength={setup ? 12 : undefined} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Please wait…" : submitLabel}</Button>
        </form>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label={PRODUCT_NAME}>
      <span className="brand__mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <span>{PRODUCT_NAME}</span>
    </div>
  );
}

function FullScreenState({ children }: { children: React.ReactNode }) {
  return <main className="full-screen-state">{children}</main>;
}
