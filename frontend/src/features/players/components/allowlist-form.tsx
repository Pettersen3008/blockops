import type { FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AllowlistForm({
  name,
  error,
  onNameChange,
  onSubmit,
}: {
  name: string;
  error: string | null;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
      <Field label="Add to allowlist" htmlFor="allowlist-name" hint={error ?? undefined} hintId="allowlist-name-error" hintIsError={Boolean(error)}>
        <Input
          className="h-10 sm:w-52"
          id="allowlist-name"
          placeholder="Java username"
          aria-describedby={error ? "allowlist-name-error" : undefined}
          aria-invalid={Boolean(error)}
          maxLength={16}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <Button type="submit"><UserPlus data-icon="inline-start" aria-hidden="true" /> Add</Button>
    </form>
  );
}
