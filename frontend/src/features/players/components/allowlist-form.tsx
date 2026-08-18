import { type FormEvent, useId, useState } from "react";
import { UserPlus } from "lucide-react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_NAME_LENGTH, playerNameSchema } from "../player-schema";

/**
 * Adds a player to the vanilla allowlist by name, for players the server has never seen
 * and so cannot be picked from the table.
 *
 * Ownership: this form decides whether the draft is a valid Java username and says so.
 * The page owns the draft text itself, because the page is what decides when a
 * successful action discards it.
 */
export function AllowlistForm({
  name,
  onNameChange,
  onSubmit,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: (validName: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const nameErrorId = `${nameId}-error`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = playerNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That username is not valid.");
      return;
    }
    setError(null);
    onSubmit(parsed.data);
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
          // Exact rather than coarse: the username pattern is ASCII-only, so UTF-16 units
          // and UTF-8 bytes agree. Do not "align" this with the reason field's guard.
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <Button type="submit"><UserPlus data-icon="inline-start" aria-hidden="true" /> Add</Button>
    </form>
  );
}
