import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { LoadingState } from "@/components/common/async-state";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/config";
import { safeErrorMessage } from "@/lib/api/api-error";
import { AppBrand } from "@/components/common/app-brand";
import { AuthForm } from "./auth-form";
import {
  useLoginMutation,
  useSessionQuery,
  useSetupMutation,
  useSetupStatus,
} from "./auth-hooks";

export function AuthenticationBoundary() {
  const setup = useSetupStatus();
  const session = useSessionQuery(setup.data?.required === false);

  if (setup.isLoading || (setup.data?.required === false && session.isLoading)) {
    return <FullScreenState><LoadingState label={`Starting ${PRODUCT_NAME}`} /></FullScreenState>;
  }
  if (setup.isError) {
    return (
      <FullScreenState>
        <Notice tone="danger">{safeErrorMessage(setup.error)} Check that the BlockOps API is running.</Notice>
      </FullScreenState>
    );
  }
  if (setup.data?.required) return <SetupScreen />;
  // A session that has loaded once survives a failed background refetch. getSession maps
  // 401 to null rather than to an error, so reaching here with data still in hand means the
  // API blipped — it does not mean the operator was signed out. This matters because broad
  // invalidation (decision D-2c) refetches this query after every server-state mutation, so
  // without the data check a single failed refetch would replace the whole dashboard
  // mid-action, and the session query does not retry.
  if (session.isError && !session.data) {
    return (
      <FullScreenState>
        <Notice tone="danger">{safeErrorMessage(session.error)}</Notice>
        <Button onClick={() => void session.refetch()}>Try again</Button>
      </FullScreenState>
    );
  }
  if (!session.data) return <LoginScreen />;
  return <Outlet context={session.data} />;
}

function SetupScreen() {
  const setup = useSetupMutation();
  return (
    <AuthScreen>
      <AuthForm
        mode="setup"
        eyebrow="Secure first run"
        title="Create the first administrator"
        description="No default credentials exist. This account will control users, worlds, restores, and integration settings."
        submitLabel="Create administrator"
        onSubmit={setup.mutate}
        error={setup.error}
        pending={setup.isPending}
      />
    </AuthScreen>
  );
}

function LoginScreen() {
  const login = useLoginMutation();
  return (
    <AuthScreen>
      <AuthForm
        mode="login"
        eyebrow="Private control plane"
        title="Welcome back"
        description="Sign in to monitor and operate the configured Minecraft server."
        submitLabel="Sign in"
        onSubmit={login.mutate}
        error={login.error}
        pending={login.isPending}
      />
    </AuthScreen>
  );
}

function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <AppBrand />
        <div className="auth-intro__copy">
          <span className="signal-mark"><span /><span /><span /></span>
          <h2>Operate the world.<br />Not the host.</h2>
          <p>A deliberately narrow dashboard for one Minecraft server, with audited actions and no browser shell.</p>
        </div>
        <p className="auth-intro__foot">Designed for private networks and trusted HTTPS proxies.</p>
      </section>
      <main className="auth-panel">{children}</main>
    </div>
  );
}

function FullScreenState({ children }: { children: ReactNode }) {
  return <main className="full-screen-state">{children}</main>;
}
