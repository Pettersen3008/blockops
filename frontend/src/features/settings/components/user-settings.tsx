import { type FormEvent, useState } from "react";
import { Plus, ShieldCheck, UserRoundCog, UserX } from "lucide-react";
import { ConfirmDialog } from "@/components/common/action-dialog";
import { EmptyState } from "@/components/common/async-state";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Role, Session, User } from "@/features/auth";
import { formatDate } from "@/formatters";
import { safeErrorMessage } from "@/lib/api/api-error";
import { useChangeUser, useCreateUser } from "../settings-hooks";
import { createUserRequestSchema } from "../settings-schemas";
import type { CreateUserRequest } from "../settings-schemas";

type UserIntent = { type: "disable" | "revoke"; user: User } | null;
type FieldErrors = Partial<Record<keyof CreateUserRequest, string>>;

export function UserSettings({ session, users }: { session: Session; users: User[] }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [intent, setIntent] = useState<UserIntent>(null);
  const create = useCreateUser(session.csrfToken);
  const change = useChangeUser(session.csrfToken, session.user.id, () => setIntent(null));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = createUserRequestSchema.safeParse({ username, password, role });
    if (!result.success) {
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

  return (
    <Card className="settings-section">
      <div className="settings-section__heading">
        <div className="settings-icon"><UserRoundCog aria-hidden="true" /></div>
        <div><p className="eyebrow">Dashboard access</p><h2>Users and roles</h2><p>Roles govern BlockOps only. Vanilla operator status is managed on Players.</p></div>
      </div>
      <form className="create-user-form" onSubmit={submit} noValidate>
        <Field label="Username" htmlFor="new-username" hint={fieldErrors.username} hintId="new-username-error" hintIsError={Boolean(fieldErrors.username)}>
          <input id="new-username" aria-describedby={fieldErrors.username ? "new-username-error" : undefined} aria-invalid={Boolean(fieldErrors.username)} value={username} onChange={(event) => setUsername(event.target.value)} required />
        </Field>
        <Field label="Temporary password" htmlFor="new-password" hint={fieldErrors.password} hintId="new-password-error" hintIsError={Boolean(fieldErrors.password)}>
          <input id="new-password" type="password" autoComplete="new-password" aria-describedby={fieldErrors.password ? "new-password-error" : undefined} aria-invalid={Boolean(fieldErrors.password)} minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Field label="Role" htmlFor="new-role" hint={fieldErrors.role} hintId="new-role-error" hintIsError={Boolean(fieldErrors.role)}>
          <select id="new-role" aria-describedby={fieldErrors.role ? "new-role-error" : undefined} aria-invalid={Boolean(fieldErrors.role)} value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="viewer">Viewer</option><option value="operator">Operator</option><option value="administrator">Administrator</option>
          </select>
        </Field>
        <Button type="submit" disabled={create.isPending}><Plus aria-hidden="true" />{create.isPending ? "Creating…" : "Create user"}</Button>
      </form>
      {create.isError ? <Notice tone="danger">{safeErrorMessage(create.error)}</Notice> : null}
      {change.isError ? <Notice tone="danger">{safeErrorMessage(change.error)}</Notice> : null}
      {users.length === 0 ? (
        <EmptyState title="No users" description="The initial administrator should always be present." />
      ) : (
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.id}>
              <div className="user-row__avatar">{user.username.slice(0, 2).toUpperCase()}</div>
              <div className="user-row__identity"><div><strong>{user.username}</strong>{user.id === session.user.id ? <span>(you)</span> : null}</div><p>Created {formatDate(user.createdAt)}</p></div>
              <StatusPill tone={user.disabled ? "bad" : user.role === "administrator" ? "info" : "neutral"}>{user.disabled ? "disabled" : user.role}</StatusPill>
              <div className="user-row__actions">
                <Button variant="secondary" onClick={() => setIntent({ type: "revoke", user })}><ShieldCheck aria-hidden="true" />Revoke sessions</Button>
                {user.id !== session.user.id && !user.disabled ? <Button variant="destructive" onClick={() => setIntent({ type: "disable", user })}><UserX aria-hidden="true" />Disable</Button> : null}
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
        busy={change.isPending}
        onClose={() => setIntent(null)}
        onConfirm={() => intent && change.mutate({ type: intent.type, userId: intent.user.id })}
      />
    </Card>
  );
}
