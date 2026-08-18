import { type FormEvent, useId } from "react";
import { UserPlus } from "lucide-react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_NAME_LENGTH } from "../player-schema";

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
  const nameId = useId();
  const nameErrorId = `${nameId}-error`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
      <Field label="Add to allowlist" htmlFor={nameId} hint={error ?? undefined} hintId={nameErrorId} hintIsError={Boolean(error)}>
        <Input
          className="h-10 sm:w-52"
          id={nameId}
          placeholder="Java username"
          aria-describedby={error ? nameErrorId : undefined}
          aria-invalid={Boolean(error)}
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <Button type="submit"><UserPlus data-icon="inline-start" aria-hidden="true" /> Add</Button>
    </form>
  );
}
