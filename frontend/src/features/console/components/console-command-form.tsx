import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { Send, TerminalSquare } from "lucide-react";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import { safeErrorMessage } from "@/lib/api/api-error";
import { consoleCommandSchema } from "../console-schema";
import { useExecuteConsoleCommand } from "../hooks/use-execute-console-command";

export function ConsoleCommandForm() {
  const execute = useExecuteConsoleCommand();
  const [command, setCommand] = useState("");
  const [commandError, setCommandError] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const actionRef = useRef(0);

  const startDraft = (value: string) => {
    actionRef.current += 1;
    setCommand(value);
    setCommandError(null);
    setActiveCommand(null);
    if (!execute.isPending) execute.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (execute.isPending) return;
    actionRef.current += 1;
    const action = actionRef.current;
    setCommandError(null);
    execute.reset();
    const parsed = consoleCommandSchema.safeParse(command);
    if (!parsed.success) {
      setCommandError(parsed.error.issues[0]?.message ?? "Enter a valid command.");
      return;
    }
    setActiveCommand(parsed.data);
    execute.mutate(parsed.data, {
      onSuccess: (_result, value) => {
        if (actionRef.current !== action) return;
        commandHistoryRef.current = [value, ...commandHistoryRef.current.filter((item) => item !== value)].slice(0, 50);
        setCommand("");
        historyIndexRef.current = -1;
      },
    });
  };

  const commandKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const commandHistory = commandHistoryRef.current;
    const next = event.key === "ArrowUp"
      ? Math.min(commandHistory.length - 1, historyIndexRef.current + 1)
      : Math.max(-1, historyIndexRef.current - 1);
    historyIndexRef.current = next;
    startDraft(next >= 0 ? commandHistory[next] ?? "" : "");
  };
  const mutationBelongsToSurface = activeCommand !== null && activeCommand === execute.variables;

  return (
    <>
      <form className="mt-3 grid min-w-0 grid-cols-[22px_10px_minmax(0,1fr)_auto] items-center gap-2 rounded-[13px] border border-[var(--line)] bg-[var(--surface)] py-2 pr-2 pl-3.5 shadow-[var(--shadow-soft)] max-[660px]:grid-cols-[18px_8px_minmax(0,1fr)] [&>svg]:w-[19px] [&>svg]:text-primary-hover" onSubmit={submit} noValidate>
        <TerminalSquare aria-hidden="true" />
        <label htmlFor="minecraft-command" className="sr-only">Minecraft command</label>
        <span className="font-mono text-muted-foreground" aria-hidden="true">/</span>
        <input className="min-h-10 min-w-0 border-0 p-0 font-mono shadow-none" id="minecraft-command" aria-describedby={commandError ? "command-error" : undefined} aria-invalid={Boolean(commandError)} value={command} onChange={(event) => startDraft(event.target.value)} onKeyDown={commandKeyDown} placeholder="say Server restart in 10 minutes" maxLength={4096} autoComplete="off" />
        <Button className="max-[660px]:col-span-full" type="submit" disabled={!command.trim() || execute.isPending}><Send aria-hidden="true" />{execute.isPending ? "Sending…" : "Send"}</Button>
      </form>
      {commandError ? <Notice tone="danger"><span id="command-error">{commandError}</span></Notice> : null}
      {execute.isError && mutationBelongsToSurface ? <Notice tone="danger">{safeErrorMessage(execute.error)}</Notice> : null}
      {execute.isSuccess && mutationBelongsToSurface ? <Notice tone="success"><strong>RCON response:</strong> {execute.data.response || "Command accepted with no response."}</Notice> : null}
    </>
  );
}
