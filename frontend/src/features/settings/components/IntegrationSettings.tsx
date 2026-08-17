import { type FormEvent, useState } from "react";
import { Cable, KeyRound, LockKeyhole } from "lucide-react";
import { Field } from "@/components/common/Field";
import { Notice } from "@/components/common/Notice";
import { StatusPill } from "@/components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Session } from "@/features/auth";
import { safeErrorMessage } from "@/lib/api/ApiError";
import { useUpdateRcon } from "../settings.hooks";
import { rconCredentialsSchema } from "../settings.schemas";
import type { RconCredentials, SettingsData } from "../settings.schemas";

type FieldErrors = Partial<Record<keyof RconCredentials, string>>;

export function IntegrationSettings({ session, status }: { session: Session; status: SettingsData["rcon"] }) {
  const [editedAddress, setEditedAddress] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const update = useUpdateRcon(session.csrfToken);
  const address = editedAddress ?? status.address;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = rconCredentialsSchema.safeParse({ address, password });
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      setFieldErrors({ address: errors.address?.[0], password: errors.password?.[0] });
      return;
    }
    setFieldErrors({});
    update.mutate(result.data, {
      onSuccess: () => {
        setEditedAddress(null);
        setPassword("");
      },
    });
  };

  return (
    <Card className="settings-section">
      <div className="settings-section__heading">
        <div className="settings-icon"><Cable aria-hidden="true" /></div>
        <div><p className="eyebrow">Private integration</p><h2>RCON credentials</h2><p>Used only by the backend for Minecraft commands and save coordination.</p></div>
        <StatusPill tone={status.configured ? "good" : "warn"}>{status.configured ? "configured" : "missing"}</StatusPill>
      </div>
      <dl className="settings-facts">
        <div><dt>Address</dt><dd><code>{status.address || "Not configured"}</code></dd></div>
        <div><dt>Credential source</dt><dd>{status.source}</dd></div>
        <div><dt>Browser exposure</dt><dd>Never</dd></div>
      </dl>
      {status.credentialUpdatesEnabled ? (
        <form className="settings-form" onSubmit={submit} noValidate>
          {update.isError ? <Notice tone="danger">{safeErrorMessage(update.error)}</Notice> : null}
          {update.isSuccess ? <Notice tone="success">Encrypted RCON credentials updated.</Notice> : null}
          <Field label="RCON address" htmlFor="rcon-address" hint={fieldErrors.address ?? "Private Docker DNS name and port, for example minecraft:25575."} hintId="rcon-address-hint" hintIsError={Boolean(fieldErrors.address)}>
            <input id="rcon-address" aria-describedby="rcon-address-hint" aria-invalid={Boolean(fieldErrors.address)} value={address} onChange={(event) => setEditedAddress(event.target.value)} required />
          </Field>
          <Field label="New RCON password" htmlFor="rcon-password" hint={fieldErrors.password ?? "Stored with AES-256-GCM using the external BlockOps encryption key."} hintId="rcon-password-hint" hintIsError={Boolean(fieldErrors.password)}>
            <input id="rcon-password" type="password" autoComplete="new-password" aria-describedby="rcon-password-hint" aria-invalid={Boolean(fieldErrors.password)} minLength={8} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={update.isPending}><KeyRound aria-hidden="true" />{update.isPending ? "Saving…" : "Update credentials"}</Button>
        </form>
      ) : (
        <Notice tone="warning"><LockKeyhole aria-hidden="true" /> Credential updates are locked. Set <code>BLOCKOPS_ENCRYPTION_KEY</code> and restart; environment-provided RCON credentials continue to work.</Notice>
      )}
    </Card>
  );
}
