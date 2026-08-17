import {
  type FormEvent,
  type KeyboardEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, CirclePause, CirclePlay, Search, Send, TerminalSquare } from "lucide-react";
import { api, errorMessage } from "../api";
import { Button, ErrorState, LoadingState, Notice, PageHeader, StatusPill } from "../components/ui";
import { hasPermission } from "@/features/auth";
import type { Session } from "@/features/auth";
import type { ConsoleLine } from "../types";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
type LevelFilter = "all" | "warning" | "error";

export function ConsolePage({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ["console", "history"], queryFn: api.consoleHistory });
  const [liveLines, setLiveLines] = useState<ConsoleLine[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [command, setCommand] = useState("");
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [response, setResponse] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const canExecute = hasPermission(session.user.role, "console.execute");

  useEffect(() => connectConsoleStream(
    setConnection,
    (line) => startTransition(() => setLiveLines((current) => [...current, line].slice(-2000))),
  ), []);

  const lines = useMemo(() => [...(history.data?.lines ?? []), ...liveLines].slice(-2000), [history.data?.lines, liveLines]);
  const filtered = useMemo(() => lines.filter((line) => {
    const lower = line.text.toLowerCase();
    if (deferredSearch && !lower.includes(deferredSearch)) return false;
    if (level === "warning") return lower.includes("[warn]");
    if (level === "error") return lower.includes("[error]") || lower.includes("exception");
    return true;
  }), [deferredSearch, level, lines]);

  useEffect(() => {
    if (!paused) terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [filtered.length, paused]);

  const execute = useMutation({
    mutationFn: (value: string) => api.executeCommand(session.csrfToken, value),
    onSuccess: (result, value) => {
      setResponse(result.response || "Command accepted with no response.");
      commandHistoryRef.current = [value, ...commandHistoryRef.current.filter((item) => item !== value)].slice(0, 50);
      setCommand("");
      historyIndexRef.current = -1;
      void queryClient.invalidateQueries({ queryKey: ["console", "history"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["players"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (command.trim()) execute.mutate(command.trim());
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
  if (history.isError) return <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} />;

  return (
    <>
      <PageHeader eyebrow="RCON + latest.log" title="Console" description="A bounded, sanitized Minecraft console. Commands never reach a host shell." actions={<StatusPill tone={connection === "connected" ? "good" : connection === "disconnected" ? "bad" : "warn"}>{connection}</StatusPill>} />
      <section className="console-toolbar" aria-label="Console filters">
        <label className="search-input"><Search aria-hidden="true" /><span className="sr-only">Search console</span><input type="search" placeholder="Search console output" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="segmented" aria-label="Log level filter">
          {(["all", "warning", "error"] as const).map((value) => <button key={value} aria-pressed={level === value} onClick={() => setLevel(value)}>{value}</button>)}
        </div>
        <Button variant="secondary" onClick={() => setPaused((value) => !value)}>{paused ? <CirclePlay aria-hidden="true" /> : <CirclePause aria-hidden="true" />}{paused ? "Resume" : "Pause"}</Button>
      </section>
      <section className="terminal-shell" aria-label="Minecraft console output">
        <div className="terminal-shell__header"><div><span /><span /><span /></div><p>{filtered.length} lines shown · 2,000 line client limit</p></div>
        <div className="terminal" ref={terminalRef} tabIndex={0} role="log" aria-live={paused ? "off" : "polite"} aria-relevant="additions text">
          {filtered.length === 0 ? <p className="terminal__empty">No console lines match this view.</p> : filtered.map((line) => (
            <div className={lineClass(line.text)} key={`${line.sequence}-${line.timestamp}`}><time dateTime={line.timestamp}>{formatConsoleTime(line.timestamp)}</time><code>{line.text}</code></div>
          ))}
        </div>
        {paused ? <button className="jump-live" onClick={() => setPaused(false)}><ArrowDown aria-hidden="true" /> Return to live output</button> : null}
      </section>
      {canExecute ? (
        <form className="command-form" onSubmit={submit}>
          <TerminalSquare aria-hidden="true" />
          <label htmlFor="minecraft-command" className="sr-only">Minecraft command</label>
          <span aria-hidden="true">/</span>
          <input id="minecraft-command" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={commandKeyDown} placeholder="say Server restart in 10 minutes" maxLength={4096} autoComplete="off" />
          <Button type="submit" disabled={!command.trim() || execute.isPending}><Send aria-hidden="true" />{execute.isPending ? "Sending…" : "Send"}</Button>
        </form>
      ) : <Notice>Viewer access is read-only. Ask an administrator for the Operator role to submit Minecraft commands.</Notice>}
      {execute.isError ? <Notice tone="danger">{errorMessage(execute.error)}</Notice> : null}
      {response ? <Notice tone="success"><strong>RCON response:</strong> {response}</Notice> : null}
    </>
  );
}

function lineClass(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("[error]") || lower.includes("exception")) return "terminal__line terminal__line--error";
  if (lower.includes("[warn]")) return "terminal__line terminal__line--warning";
  return "terminal__line";
}

function formatConsoleTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString([], { hour12: false });
}

function connectConsoleStream(
  onConnection: (state: ConnectionState) => void,
  onLine: (line: ConsoleLine) => void,
) {
  let socket: WebSocket | undefined;
  let timer: number | undefined;
  let stopped = false;
  let attempt = 0;
  const connect = () => {
    if (stopped) return;
    onConnection(attempt === 0 ? "connecting" : "reconnecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/console/ws`);
    socket.onopen = () => {
      attempt = 0;
      onConnection("connected");
    };
    socket.onmessage = (event) => {
      try {
        const line = JSON.parse(String(event.data)) as ConsoleLine;
        if (typeof line.sequence === "number" && typeof line.text === "string") onLine(line);
      } catch {
        // Invalid integration data is ignored instead of rendered.
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      attempt += 1;
      onConnection("reconnecting");
      timer = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(attempt, 5)));
    };
    socket.onerror = () => socket?.close();
  };
  connect();
  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    onConnection("disconnected");
  };
}
