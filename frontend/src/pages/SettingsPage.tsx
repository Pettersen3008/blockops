import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, KeyRound, LockKeyhole, Plus, ServerCog, ShieldCheck, UserRoundCog, UserX } from "lucide-react";
import { api, errorMessage } from "../api";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, StatusPill } from "../components/ui";
import { formatBytes, formatDate } from "../formatters";
import type { Role, Session, User } from "@/features/auth";

type UserIntent = { type: "disable" | "revoke"; user: User } | null;

export function SettingsPage({ session }: { session: Session }) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  if (settings.isLoading || users.isLoading) return <LoadingState label="Loading protected settings" />;
  if (settings.isError) return <ErrorState message={errorMessage(settings.error)} onRetry={() => void settings.refetch()} />;
  if (users.isError) return <ErrorState message={errorMessage(users.error)} onRetry={() => void users.refetch()} />;
  if (!settings.data || !users.data) return null;
  return (
    <>
      <PageHeader eyebrow="Administrator controls" title="Settings" description="Dashboard users, revocable sessions, encrypted RCON credentials, and immutable deployment boundaries." />
      <div className="settings-stack">
        <IntegrationSettings session={session} settings={settings.data} />
        <UserSettings session={session} users={users.data.users} />
        <DeploymentSettings settings={settings.data} />
      </div>
    </>
  );
}

function IntegrationSettings({ session, settings }: { session: Session; settings: Awaited<ReturnType<typeof api.settings>> }) {
  const queryClient = useQueryClient();
  const [editedAddress, setEditedAddress] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const address = editedAddress ?? settings.rcon.address;
  const update = useMutation({
    mutationFn: () => api.updateRCON(session.csrfToken, address, password),
    onSuccess: () => {
      setEditedAddress(null);
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); update.mutate(); };
  return (
    <Card className="settings-section">
      <div className="settings-section__heading"><div className="settings-icon"><Cable aria-hidden="true" /></div><div><p className="eyebrow">Private integration</p><h2>RCON credentials</h2><p>Used only by the backend for Minecraft commands and save coordination.</p></div><StatusPill tone={settings.rcon.configured ? "good" : "warn"}>{settings.rcon.configured ? "configured" : "missing"}</StatusPill></div>
      <dl className="settings-facts"><div><dt>Address</dt><dd><code>{settings.rcon.address || "Not configured"}</code></dd></div><div><dt>Credential source</dt><dd>{settings.rcon.source}</dd></div><div><dt>Browser exposure</dt><dd>Never</dd></div></dl>
      {settings.rcon.credentialUpdatesEnabled ? (
        <form className="settings-form" onSubmit={submit}>
          {update.isError ? <Notice tone="danger">{errorMessage(update.error)}</Notice> : null}
          {update.isSuccess ? <Notice tone="success">Encrypted RCON credentials updated.</Notice> : null}
          <Field label="RCON address" htmlFor="rcon-address" hint="Private Docker DNS name and port, for example minecraft:25575."><input id="rcon-address" value={address} onChange={(event) => setEditedAddress(event.target.value)} required /></Field>
          <Field label="New RCON password" htmlFor="rcon-password" hint="Stored with AES-256-GCM using the external BlockOps encryption key."><input id="rcon-password" type="password" autoComplete="new-password" minLength={8} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          <Button type="submit" disabled={update.isPending}><KeyRound aria-hidden="true" />{update.isPending ? "Saving…" : "Update credentials"}</Button>
        </form>
      ) : <Notice tone="warning"><LockKeyhole aria-hidden="true" /> Credential updates are locked. Set <code>BLOCKOPS_ENCRYPTION_KEY</code> and restart; environment-provided RCON credentials continue to work.</Notice>}
    </Card>
  );
}

function UserSettings({ session, users }: { session: Session; users: User[] }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [intent, setIntent] = useState<UserIntent>(null);
  const create = useMutation({
    mutationFn: () => api.createUser(session.csrfToken, username, password, role),
    onSuccess: () => { setUsername(""); setPassword(""); setRole("viewer"); void queryClient.invalidateQueries({ queryKey: ["users"] }); },
  });
  const change = useMutation({
    mutationFn: async (next: NonNullable<UserIntent>) => next.type === "disable" ? api.disableUser(session.csrfToken, next.user.id) : api.revokeSessions(session.csrfToken, next.user.id),
    onSuccess: () => { setIntent(null); void queryClient.invalidateQueries({ queryKey: ["users"] }); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate(); };
  return (
    <Card className="settings-section">
      <div className="settings-section__heading"><div className="settings-icon"><UserRoundCog aria-hidden="true" /></div><div><p className="eyebrow">Dashboard access</p><h2>Users and roles</h2><p>Roles govern BlockOps only. Vanilla operator status is managed on Players.</p></div></div>
      <form className="create-user-form" onSubmit={submit}>
        <Field label="Username" htmlFor="new-username"><input id="new-username" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" value={username} onChange={(event) => setUsername(event.target.value)} required /></Field>
        <Field label="Temporary password" htmlFor="new-password"><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        <Field label="Role" htmlFor="new-role"><select id="new-role" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="administrator">Administrator</option></select></Field>
        <Button type="submit" disabled={create.isPending}><Plus aria-hidden="true" />{create.isPending ? "Creating…" : "Create user"}</Button>
      </form>
      {create.isError ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
      {change.isError ? <Notice tone="danger">{errorMessage(change.error)}</Notice> : null}
      {users.length === 0 ? <EmptyState title="No users" description="The initial administrator should always be present." /> : (
        <div className="user-list">{users.map((user) => <div className="user-row" key={user.id}><div className="user-row__avatar">{user.username.slice(0, 2).toUpperCase()}</div><div className="user-row__identity"><div><strong>{user.username}</strong>{user.id === session.user.id ? <span>(you)</span> : null}</div><p>Created {formatDate(user.createdAt)}</p></div><StatusPill tone={user.disabled ? "bad" : user.role === "administrator" ? "info" : "neutral"}>{user.disabled ? "disabled" : user.role}</StatusPill><div className="user-row__actions"><Button variant="secondary" onClick={() => setIntent({ type: "revoke", user })}><ShieldCheck aria-hidden="true" />Revoke sessions</Button>{user.id !== session.user.id && !user.disabled ? <Button variant="danger" onClick={() => setIntent({ type: "disable", user })}><UserX aria-hidden="true" />Disable</Button> : null}</div></div>)}</div>
      )}
      <ConfirmDialog open={intent !== null} title={intent?.type === "disable" ? `Disable ${intent.user.username}?` : `Revoke sessions for ${intent?.user.username ?? "this user"}?`} description={intent?.type === "disable" ? "The account will be disabled and all active sessions revoked. This MVP does not delete audit history." : "Every active session for this account will stop working immediately, including the current session if it belongs to you."} confirmLabel={intent?.type === "disable" ? "Disable user" : "Revoke sessions"} dangerous={intent?.type === "disable"} busy={change.isPending} onClose={() => setIntent(null)} onConfirm={() => intent && change.mutate(intent)} />
    </Card>
  );
}

function DeploymentSettings({ settings }: { settings: Awaited<ReturnType<typeof api.settings>> }) {
  return (
    <Card className="settings-section">
      <div className="settings-section__heading"><div className="settings-icon"><ServerCog aria-hidden="true" /></div><div><p className="eyebrow">Restart required</p><h2>Deployment boundaries</h2><p>These values come from the host environment and cannot be widened from the browser.</p></div></div>
      <dl className="deployment-grid"><div><dt>Minecraft container</dt><dd><code>{settings.deployment.minecraftContainer}</code></dd></div><div><dt>World name</dt><dd><code>{settings.deployment.worldName}</code></dd></div><div><dt>Upload limit</dt><dd>{formatBytes(settings.deployment.maxUploadBytes)}</dd></div><div><dt>Secure cookies</dt><dd>{settings.deployment.cookieSecure ? "Required" : "Disabled (development only)"}</dd></div><div><dt>Trusted proxy ranges</dt><dd>{settings.deployment.trustedProxyCount}</dd></div><div><dt>Host shell</dt><dd>Not available</dd></div></dl>
    </Card>
  );
}
