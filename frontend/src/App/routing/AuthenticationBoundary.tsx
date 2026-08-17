import { type FormEvent, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { api, errorMessage } from "@/api";
import { Button, Field, LoadingState, Notice } from "@/components/ui";
import { PRODUCT_NAME } from "@/config";
import type { Session } from "@/types";
import { AppBrand } from "@/App/shell/AppBrand";

export function AuthenticationBoundary() {
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
  return <Outlet context={session.data} />;
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
        <AppBrand />
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

function FullScreenState({ children }: { children: ReactNode }) {
  return <main className="full-screen-state">{children}</main>;
}
