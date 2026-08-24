import { type FormEvent, useRef, useState } from "react";
import { Plus, ShieldCheck, UserRoundCog, UserX } from "lucide-react";
import { ConfirmDialog } from "@/components/common/action-dialog";
import { EmptyState } from "@/components/common/async-state";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Role, Session, User } from "@/features/auth";
import { formatDate } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/api-error";
import { useCreateUser } from "../hooks/use-create-user";
import { useDisableUser } from "../hooks/use-disable-user";
import { useRevokeUserSessions } from "../hooks/use-revoke-user-sessions";
import { createUserRequestSchema } from "../settings-schema";
import type { CreateUserRequest } from "../settings-schema";

type UserIntent = { type: "disable" | "revoke"; user: User; surfaceId: number } | null;
type FieldErrors = Partial<Record<keyof CreateUserRequest, string>>;

export function UserSettings({ session, users }: { session: Session; users: User[] }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [intent, setIntent] = useState<UserIntent>(null);
  const nextSurfaceId = useRef(0);
  const create = useCreateUser();
  const disable = useDisableUser();
  const revoke = useRevokeUserSessions();
  const activeChange = intent?.type === "disable" ? disable : revoke;
  const activeSurfaceMatches = activeChange.variables?.surfaceId === intent?.surfaceId;

  const editCreateField = () => {
    if (create.isError || create.isSuccess) create.reset();
  };

  const openIntent = (type: "disable" | "revoke", user: User) => {
    const mutation = type === "disable" ? disable : revoke;
    mutation.reset();
    nextSurfaceId.current += 1;
    setIntent({ type, user, surfaceId: nextSurfaceId.current });
  };

  const closeIntent = () => {
    if (intent?.type === "disable") disable.reset();
    if (intent?.type === "revoke") revoke.reset();
    setIntent(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = createUserRequestSchema.safeParse({ username, password, role });
    if (!result.success) {
      create.reset();
      const errors = result.error.flatten().fieldErrors;
      setFieldErrors({ username: errors.username?.[0], password: errors.password?.[0], role: errors.role?.[0] });
      return;
    }
    setFieldErrors({});
    create.mutate(result.data, {
      onSuccess: () => {
        setUsername("");
        setPassword("");
        setRole("viewer");
      },
    });
  };

  const confirmIntent = () => {
    if (!intent) return;

    const initiatingSurfaceId = intent.surfaceId;
    const input = { userId: intent.user.id, surfaceId: initiatingSurfaceId };
    const onSuccess = () => setIntent((current) => current?.surfaceId === initiatingSurfaceId ? null : current);
    if (intent.type === "disable") disable.mutate(input, { onSuccess });
    else revoke.mutate(input, { onSuccess });
  };

  return (
    <Card className="min-w-0 p-6 [overflow-wrap:anywhere] max-[660px]:p-[18px]">
      <div className="grid grid-cols-[48px_1fr_auto] items-start gap-3.5 border-b border-border pb-5 max-[660px]:grid-cols-[44px_1fr] [&>div]:min-w-0">
        <div className="grid size-11 place-items-center rounded-xl bg-accent text-primary-hover [&_svg]:w-[21px]"><UserRoundCog aria-hidden="true" /></div>
        <div><p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Dashboard access</p><h2 className="mb-1 text-xl">Users and roles</h2><p className="m-0 text-muted-foreground">Roles govern BlockOps only. Vanilla operator status is managed on Players.</p></div>
      </div>
      <form className="my-5 grid grid-cols-[1fr_1fr_minmax(150px,.55fr)_auto] items-end gap-3 max-[1180px]:grid-cols-2 max-[660px]:grid-cols-1" onSubmit={submit} noValidate>
        <Field label="Username" htmlFor="new-username" hint={fieldErrors.username} hintId="new-username-error" hintIsError={Boolean(fieldErrors.username)}>
          <Input id="new-username" aria-describedby={fieldErrors.username ? "new-username-error" : undefined} aria-invalid={Boolean(fieldErrors.username)} value={username} onChange={(event) => { editCreateField(); setUsername(event.target.value); setFieldErrors((errors) => ({ ...errors, username: undefined })); }} required />
        </Field>
        <Field label="Temporary password" htmlFor="new-password" hint={fieldErrors.password} hintId="new-password-error" hintIsError={Boolean(fieldErrors.password)}>
          <Input id="new-password" type="password" autoComplete="new-password" aria-describedby={fieldErrors.password ? "new-password-error" : undefined} aria-invalid={Boolean(fieldErrors.password)} minLength={12} maxLength={256} value={password} onChange={(event) => { editCreateField(); setPassword(event.target.value); setFieldErrors((errors) => ({ ...errors, password: undefined })); }} required />
        </Field>
        <Field label="Role" htmlFor="new-role" hint={fieldErrors.role} hintId="new-role-error" hintIsError={Boolean(fieldErrors.role)}>
          <select className="min-h-11 w-full rounded-[var(--radius-sm)] border border-input bg-card px-3 text-foreground transition-[border-color,box-shadow] duration-150 hover:border-[color-mix(in_srgb,var(--primary-hover)_50%,var(--line))] focus:border-primary-hover focus:ring-3 focus:ring-[color-mix(in_srgb,var(--primary-hover)_15%,transparent)] focus:outline-none" id="new-role" aria-describedby={fieldErrors.role ? "new-role-error" : undefined} aria-invalid={Boolean(fieldErrors.role)} value={role} onChange={(event) => { editCreateField(); setRole(event.target.value as Role); setFieldErrors((errors) => ({ ...errors, role: undefined })); }}>
            <option value="viewer">Viewer</option><option value="operator">Operator</option><option value="administrator">Administrator</option>
          </select>
        </Field>
        <Button type="submit" disabled={create.isPending}><Plus aria-hidden="true" />{create.isPending ? "Creating…" : "Create user"}</Button>
      </form>
      {create.isError ? <Notice tone="danger">{safeErrorMessage(create.error)}</Notice> : null}
      {users.length === 0 ? (
        <EmptyState title="No users" description="The initial administrator should always be present." />
      ) : (
        <div className="border-t border-border">
          {users.map((user) => (
            <div className="grid min-h-[78px] grid-cols-[42px_minmax(160px,1fr)_auto_auto] items-center gap-[13px] border-b border-border py-2.5 last:border-b-0 max-[660px]:grid-cols-[42px_1fr_auto]" key={user.id}>
              <div className="grid size-10 place-items-center rounded-[10px] bg-accent text-xs font-bold tracking-[-.04em] text-[var(--accent-strong)]">{user.username.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0"><div className="flex gap-1.5"><strong className="truncate">{user.username}</strong>{user.id === session.user.id ? <span className="text-xs text-muted-foreground">(you)</span> : null}</div><p className="mt-[3px] mb-0 text-xs text-muted-foreground">Created {formatDate(user.createdAt)}</p></div>
              <StatusPill tone={user.disabled ? "bad" : user.role === "administrator" ? "info" : "neutral"}>{user.disabled ? "disabled" : user.role}</StatusPill>
              <div className="flex flex-wrap gap-[7px] max-[660px]:col-span-full max-[660px]:[&_button]:flex-1">
                <Button variant="secondary" onClick={() => openIntent("revoke", user)}><ShieldCheck aria-hidden="true" />Revoke sessions</Button>
                {user.id !== session.user.id && !user.disabled ? <Button variant="destructive" onClick={() => openIntent("disable", user)}><UserX aria-hidden="true" />Disable</Button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={intent !== null}
        title={intent?.type === "disable" ? `Disable ${intent.user.username}?` : `Revoke sessions for ${intent?.user.username ?? "this user"}?`}
        description={intent?.type === "disable" ? "The account will be disabled and all active sessions revoked. This MVP does not delete audit history." : "Every active session for this account will stop working immediately, including the current session if it belongs to you."}
        confirmLabel={intent?.type === "disable" ? "Disable user" : "Revoke sessions"}
        dangerous={intent?.type === "disable"}
        busy={activeSurfaceMatches && activeChange.isPending}
        error={activeSurfaceMatches && activeChange.isError ? <Notice tone="danger">{safeErrorMessage(activeChange.error)}</Notice> : undefined}
        onClose={closeIntent}
        onConfirm={confirmIntent}
      />
    </Card>
  );
}
