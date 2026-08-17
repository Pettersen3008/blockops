import {
  type FormEvent,
  type KeyboardEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown, CirclePause, CirclePlay, Search, Send, TerminalSquare } from "lucide-react";
import { Button, ErrorState, LoadingState, Notice, PageHeader, StatusPill } from "@/components/ui";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import { safeErrorMessage } from "@/lib/api/ApiError";
import { mergeConsoleLines, useConsoleHistory, useConsoleStream, useExecuteConsoleCommand } from "./console.hooks";
import { consoleCommandSchema } from "./console.schemas";
import type { ConsoleLine } from "./console.schemas";

type LevelFilter = "all" | "warning" | "error";

export function ConsolePage({ session }: { session: Session }) {
  const history = useConsoleHistory();
  const stream = useConsoleStream();
  const execute = useExecuteConsoleCommand(session.csrfToken);
  const [pausedLines, setPausedLines] = useState<ConsoleLine[] | null>(null);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [command, setCommand] = useState("");
  const [commandError, setCommandError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const canExecute = hasPermission(session.user.role, "console.execute");
  const lines = useMemo(
    () => mergeConsoleLines(history.data?.lines ?? [], stream.lines),
    [history.data?.lines, stream.lines],
  );
  const visibleLines = pausedLines ?? lines;
  const filtered = useMemo(() => visibleLines.filter((line) => matchesLevelAndSearch(line, deferredSearch, level)), [deferredSearch, level, visibleLines]);

  useEffect(() => {
    if (pausedLines === null) {
      const terminal = terminalRef.current;
      terminal?.scrollTo?.({ top: terminal.scrollHeight });
    }
  }, [filtered.length, pausedLines]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = consoleCommandSchema.safeParse(command);
    if (!parsed.success) {
      setCommandError(parsed.error.issues[0]?.message ?? "Enter a valid command.");
      return;
    }
    setCommandError(null);
    setResponse(null);
    execute.mutate(parsed.data, {
      onSuccess: (result, value) => {
        setResponse(result.response || "Command accepted with no response.");
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
    setCommand(next >= 0 ? commandHistory[next] ?? "" : "");
  };

  if (history.isLoading) return <LoadingState label="Loading bounded console history" />;
  if (history.isError) return <ErrorState message={safeErrorMessage(history.error)} onRetry={() => void history.refetch()} />;

  const paused = pausedLines !== null;
  return (
    <>
      <PageHeader eyebrow="RCON + latest.log" title="Console" description="A bounded, sanitized Minecraft console. Commands never reach a host shell." actions={<StatusPill tone={stream.connection === "connected" ? "good" : stream.connection === "disconnected" ? "bad" : "warn"}>{stream.connection}</StatusPill>} />
      <section className="console-toolbar" aria-label="Console filters">
        <label className="search-input"><Search aria-hidden="true" /><span className="sr-only">Search console</span><input type="search" placeholder="Search console output" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="segmented" aria-label="Log level filter">
          {(["all", "warning", "error"] as const).map((value) => <button key={value} aria-pressed={level === value} onClick={() => setLevel(value)}>{value}</button>)}
        </div>
        <Button variant="secondary" onClick={() => setPausedLines((current) => current === null ? lines : null)}>{paused ? <CirclePlay aria-hidden="true" /> : <CirclePause aria-hidden="true" />}{paused ? "Resume" : "Pause"}</Button>
      </section>
      <section className="terminal-shell" aria-label="Minecraft console output">
        <div className="terminal-shell__header"><div><span /><span /><span /></div><p>{filtered.length} lines shown · 2,000 line client limit</p></div>
        <div className="terminal" ref={terminalRef} tabIndex={0} role="log" aria-live={paused ? "off" : "polite"} aria-relevant="additions text">
          {filtered.length === 0 ? <p className="terminal__empty">No console lines match this view.</p> : filtered.map((line) => (
            <div className={lineClass(line.text)} key={`${line.sequence}-${line.timestamp}`}><time dateTime={line.timestamp}>{formatConsoleTime(line.timestamp)}</time><code>{line.text}</code></div>
          ))}
        </div>
        {paused ? <button className="jump-live" onClick={() => setPausedLines(null)}><ArrowDown aria-hidden="true" /> Return to live output</button> : null}
      </section>
      {canExecute ? (
        <form className="command-form" onSubmit={submit} noValidate>
          <TerminalSquare aria-hidden="true" />
          <label htmlFor="minecraft-command" className="sr-only">Minecraft command</label>
          <span aria-hidden="true">/</span>
          <input id="minecraft-command" aria-describedby={commandError ? "command-error" : undefined} aria-invalid={Boolean(commandError)} value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={commandKeyDown} placeholder="say Server restart in 10 minutes" maxLength={4096} autoComplete="off" />
          <Button type="submit" disabled={!command.trim() || execute.isPending}><Send aria-hidden="true" />{execute.isPending ? "Sending…" : "Send"}</Button>
        </form>
      ) : <Notice>Viewer access is read-only. Ask an administrator for the Operator role to submit Minecraft commands.</Notice>}
      {commandError ? <Notice tone="danger"><span id="command-error">{commandError}</span></Notice> : null}
      {execute.isError ? <Notice tone="danger">{safeErrorMessage(execute.error)}</Notice> : null}
      {response ? <Notice tone="success"><strong>RCON response:</strong> {response}</Notice> : null}
    </>
  );
}

function matchesLevelAndSearch(line: ConsoleLine, search: string, level: LevelFilter): boolean {
  const lower = line.text.toLowerCase();
  if (search && !lower.includes(search)) return false;
  if (level === "warning") return lower.includes("[warn]");
  if (level === "error") return lower.includes("[error]") || lower.includes("exception");
  return true;
}

function lineClass(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("[error]") || lower.includes("exception")) return "terminal__line terminal__line--error";
  if (lower.includes("[warn]")) return "terminal__line terminal__line--warning";
  return "terminal__line";
}

function formatConsoleTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour12: false });
}
