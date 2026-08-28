import { type FormEvent, useState } from "react";
import { Button, Field, Input, Notice } from "@blockops/ui";
import { safeErrorMessage } from "@/lib/api/api-error";
import { loginCredentialsSchema, setupCredentialsSchema } from "./auth-schemas";
import type { AuthCredentials } from "./auth-schemas";

type FieldErrors = Partial<Record<keyof AuthCredentials, string>>;

export function AuthForm({
  mode,
  eyebrow,
  title,
  description,
  submitLabel,
  onSubmit,
  error,
  pending,
}: {
  mode: "setup" | "login";
  eyebrow: string;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (credentials: AuthCredentials) => void;
  error?: unknown;
  pending?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const schema = mode === "setup" ? setupCredentialsSchema : loginCredentialsSchema;
    const result = schema.safeParse({ username, password });
    if (!result.success) {
      const flattened = result.error.flatten().fieldErrors;
      setFieldErrors({
        username: flattened.username?.[0],
        password: flattened.password?.[0],
      });
      return;
    }
    setFieldErrors({});
    onSubmit(result.data);
  };

  return (
    <form className="grid w-[min(430px,100%)] gap-[18px]" onSubmit={submit} noValidate>
      <p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">{eyebrow}</p>
      <h1 className="mb-0">{title}</h1>
      <p className="mb-2 text-muted-foreground">{description}</p>
      {error ? <Notice tone="danger">{safeErrorMessage(error)}</Notice> : null}
      <Field
        label="Username"
        htmlFor="username"
        hint={fieldErrors.username ?? (mode === "setup" ? "3–32 letters, numbers, dot, underscore, or hyphen." : undefined)}
        hintId="username-hint"
        hintIsError={Boolean(fieldErrors.username)}
      >
        <Input className="bg-card px-3"
          id="username"
          name="username"
          autoComplete="username"
          aria-describedby={mode === "setup" || fieldErrors.username ? "username-hint" : undefined}
          aria-invalid={Boolean(fieldErrors.username)}
          required
          minLength={3}
          maxLength={32}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint={fieldErrors.password ?? (mode === "setup" ? "At least 12 characters using three character categories." : undefined)}
        hintId="password-hint"
        hintIsError={Boolean(fieldErrors.password)}
      >
        <Input className="bg-card px-3"
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          aria-describedby={mode === "setup" || fieldErrors.password ? "password-hint" : undefined}
          aria-invalid={Boolean(fieldErrors.password)}
          required
          minLength={mode === "setup" ? 12 : undefined}
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Button className="mt-2 min-h-12" type="submit" disabled={pending}>{pending ? "Please wait…" : submitLabel}</Button>
    </form>
  );
}
