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
    <div className="grid min-h-screen grid-cols-[minmax(360px,0.9fr)_minmax(480px,1.1fr)] bg-card max-[900px]:grid-cols-1">
      <section className="relative flex min-h-screen flex-col overflow-hidden bg-[#111914] p-[clamp(30px,5vw,72px)] text-[#eaf2ec] before:absolute before:right-[-18%] before:bottom-[8%] before:w-[65%] before:aspect-square before:rotate-[42deg] before:border before:border-[rgba(126,185,144,0.17)] before:shadow-[0_0_0_38px_rgba(126,185,144,0.04),0_0_0_78px_rgba(126,185,144,0.025)] before:content-[''] max-[900px]:min-h-[340px] max-[900px]:p-[30px]">
        <AppBrand />
        <div className="relative z-1 my-auto max-[900px]:my-[55px]">
          <span className="flex h-[30px] items-end gap-[5px]"><span className="h-2.5 w-1.5 rounded-[5px] bg-[#70b784] opacity-50" /><span className="h-5 w-1.5 rounded-[5px] bg-[#70b784] opacity-75" /><span className="h-[30px] w-1.5 rounded-[5px] bg-[#70b784]" /></span>
          <h2 className="mt-6 mb-[18px] text-[clamp(2.8rem,5vw,5rem)] leading-[0.98] tracking-[-0.06em] max-[900px]:text-[3.1rem]">Operate the world.<br />Not the host.</h2>
          <p className="max-w-[500px] text-[1.05rem] text-[#a9b7ad]">A deliberately narrow dashboard for one Minecraft server, with audited actions and no browser shell.</p>
        </div>
        <p className="relative z-1 m-0 text-[0.8rem] text-[#819086]">Designed for private networks and trusted HTTPS proxies.</p>
      </section>
      <main className="flex items-center justify-center bg-card p-8 max-[900px]:px-6 max-[900px]:py-[60px]">{children}</main>
    </div>
  );
}

function FullScreenState({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">{children}</main>;
}
