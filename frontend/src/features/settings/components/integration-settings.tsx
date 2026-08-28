import { type FormEvent, useState } from "react";
import { Cable, KeyRound, LockKeyhole } from "lucide-react";
import { Button, Card, Field, Input, Notice, StatusPill } from "@blockops/ui";
import { safeErrorMessage } from "@/lib/api/api-error";
import { useUpdateRcon } from "../hooks/use-update-rcon";
import { rconCredentialsSchema } from "../settings-schema";
import type { RconCredentials, SettingsData } from "../settings-schema";

type FieldErrors = Partial<Record<keyof RconCredentials, string>>;

export function IntegrationSettings({ status }: { status: SettingsData["rcon"] }) {
  const [editedAddress, setEditedAddress] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const update = useUpdateRcon();
  const address = editedAddress ?? status.address;

  const editAddress = (value: string) => {
    if (update.isError || update.isSuccess) update.reset();
    setEditedAddress(value);
    setFieldErrors((errors) => ({ ...errors, address: undefined }));
  };

  const editPassword = (value: string) => {
    if (update.isError || update.isSuccess) update.reset();
    setPassword(value);
    setFieldErrors((errors) => ({ ...errors, password: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = rconCredentialsSchema.safeParse({ address, password });
    if (!result.success) {
      update.reset();
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
    <Card className="min-w-0 p-6 [overflow-wrap:anywhere] max-[660px]:p-[18px]">
      <div className="grid grid-cols-[48px_1fr_auto] items-start gap-3.5 border-b border-border pb-5 max-[660px]:grid-cols-[44px_1fr] [&>div]:min-w-0">
        <div className="grid size-11 place-items-center rounded-xl bg-accent text-primary-hover [&_svg]:w-[21px]"><Cable aria-hidden="true" /></div>
        <div><p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Private integration</p><h2 className="mb-1 text-xl">RCON credentials</h2><p className="m-0 text-muted-foreground">Used only by the backend for Minecraft commands and save coordination.</p></div>
        <div className="max-[660px]:col-start-2"><StatusPill tone={status.configured ? "good" : "warn"}>{status.configured ? "configured" : "missing"}</StatusPill></div>
      </div>
      <dl className="m-0 grid grid-cols-3 max-[900px]:grid-cols-2 max-[660px]:grid-cols-1 [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:truncate [&_dd]:font-semibold [&_div]:min-w-0 [&_div]:border-b [&_div]:border-border [&_div]:px-3.5 [&_div]:py-[18px] [&_dt]:mb-1.5 [&_dt]:text-xs [&_dt]:text-muted-foreground">
        <div><dt>Address</dt><dd title={status.address || "Not configured"}><code>{status.address || "Not configured"}</code></dd></div>
        <div><dt>Credential source</dt><dd title={status.source}>{status.source}</dd></div>
        <div><dt>Browser exposure</dt><dd>Never</dd></div>
      </dl>
      {status.credentialUpdatesEnabled ? (
        <form className="mt-5 grid max-w-[720px] grid-cols-[1fr_1fr_auto] items-end gap-3 max-[900px]:grid-cols-1" onSubmit={submit} noValidate>
          {update.isError ? <div className="col-span-full"><Notice tone="danger">{safeErrorMessage(update.error)}</Notice></div> : null}
          {update.isSuccess ? <div className="col-span-full"><Notice tone="success">Encrypted RCON credentials updated.</Notice></div> : null}
          <Field label="RCON address" htmlFor="rcon-address" hint={fieldErrors.address ?? "Private Docker DNS name and port, for example minecraft:25575."} hintId="rcon-address-hint" hintIsError={Boolean(fieldErrors.address)}>
            <Input id="rcon-address" aria-describedby="rcon-address-hint" aria-invalid={Boolean(fieldErrors.address)} value={address} onChange={(event) => editAddress(event.target.value)} required />
          </Field>
          <Field label="New RCON password" htmlFor="rcon-password" hint={fieldErrors.password ?? "Stored with AES-256-GCM using the external BlockOps encryption key."} hintId="rcon-password-hint" hintIsError={Boolean(fieldErrors.password)}>
            <Input id="rcon-password" type="password" autoComplete="new-password" aria-describedby="rcon-password-hint" aria-invalid={Boolean(fieldErrors.password)} minLength={8} maxLength={256} value={password} onChange={(event) => editPassword(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={update.isPending}><KeyRound aria-hidden="true" />{update.isPending ? "Saving…" : "Update credentials"}</Button>
        </form>
      ) : (
        <Notice tone="warning"><LockKeyhole aria-hidden="true" /> Credential updates are locked. Set <code>BLOCKOPS_ENCRYPTION_KEY</code> and restart; environment-provided RCON credentials continue to work.</Notice>
      )}
    </Card>
  );
}
