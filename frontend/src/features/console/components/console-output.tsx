import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CirclePause, CirclePlay, Search } from "lucide-react";
import { Button, Input } from "@blockops/ui";
import { mergeConsoleLines } from "../console-lines";
import type { ConsoleLine } from "../console-schema";

type LevelFilter = "all" | "warning" | "error";

export function ConsoleOutput({ history, live }: { history: ConsoleLine[]; live: ConsoleLine[] }) {
  const [pausedLines, setPausedLines] = useState<ConsoleLine[] | null>(null);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const terminalRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const lines = useMemo(() => mergeConsoleLines(history, live), [history, live]);
  const visibleLines = pausedLines ?? lines;
  const filtered = useMemo(
    () => visibleLines.filter((line) => matchesLevelAndSearch(line, deferredSearch, level)),
    [deferredSearch, level, visibleLines],
  );
  const latestVisibleSequence = filtered.at(-1)?.sequence;

  useEffect(() => {
    if (pausedLines === null) {
      const terminal = terminalRef.current;
      terminal?.scrollTo?.({ top: terminal.scrollHeight });
    }
  }, [filtered.length, latestVisibleSequence, pausedLines]);

  const paused = pausedLines !== null;
  return (
    <>
      <section className="mb-3.5 flex items-center gap-2.5 max-[660px]:flex-col max-[660px]:items-stretch" aria-label="Console filters">
        <label className="relative flex min-w-[220px] flex-1 items-center max-[660px]:w-full max-[660px]:min-w-0">
          <Search className="absolute left-3 w-[17px] text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search console</span>
          <Input className="bg-card pr-3 pl-[38px]" type="search" placeholder="Search console output" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="inline-flex min-h-[42px] rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] p-[3px] max-[660px]:overflow-x-auto" aria-label="Log level filter">
          {(["all", "warning", "error"] as const).map((value) => (
            <button className="cursor-pointer rounded-[7px] border-0 bg-transparent px-3 text-muted-foreground capitalize aria-pressed:bg-[var(--surface-soft)] aria-pressed:font-bold aria-pressed:text-[var(--ink)]" key={value} aria-pressed={level === value} onClick={() => setLevel(value)}>{value}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setPausedLines((current) => current === null ? lines : null)}>
          {paused ? <CirclePlay aria-hidden="true" /> : <CirclePause aria-hidden="true" />}{paused ? "Resume" : "Pause"}
        </Button>
      </section>
      <section className="relative min-w-0 overflow-hidden rounded-[15px] border border-[#2d3931] bg-[#0c110e] shadow-[var(--shadow)]" aria-label="Minecraft console output">
        <div className="flex h-[43px] items-center justify-between border-b border-[#243028] bg-[#121914] px-3.5 text-[#839087]">
          <div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-[#7e4e47]" /><span className="size-2 rounded-full bg-[#3c4a40]" /><span className="size-2 rounded-full bg-[#3c4a40]" /></div>
          <p className="m-0 font-mono text-[0.7rem] max-[660px]:hidden">{filtered.length} lines shown · 2,000 line client limit</p>
        </div>
        <div className="h-[clamp(420px,58vh,760px)] overflow-auto py-3 pb-[18px] text-[#c3cec6] [scrollbar-color:#415045_transparent] max-[660px]:h-[52vh]" ref={terminalRef} tabIndex={0} role="log" aria-label="Scrollable Minecraft console output" aria-live={paused ? "off" : "polite"} aria-relevant="additions text">
          {filtered.length === 0 ? <p className="mx-5 my-20 text-center text-[#6d786f]">No console lines match this view.</p> : filtered.map((line) => (
            <div className="grid min-h-[25px] grid-cols-[82px_minmax(0,1fr)] gap-3 px-4 py-0.5 font-mono text-[0.78rem] leading-[1.55] hover:bg-white/[0.025] max-[660px]:grid-cols-1 max-[660px]:gap-0 max-[660px]:py-[5px]" key={`${line.sequence}-${line.timestamp}`}>
              <time className="text-[#667269] max-[660px]:text-[0.66rem]" dateTime={line.timestamp}>{formatConsoleTime(line.timestamp)}</time>
              <code className={`min-w-0 whitespace-pre-wrap [font:inherit] [overflow-wrap:anywhere] ${lineTone(line.text)}`}>{line.text}</code>
            </div>
          ))}
        </div>
        {paused ? <button className="absolute right-[18px] bottom-4 flex min-h-[38px] cursor-pointer items-center gap-[7px] rounded-full border border-[#405147] bg-[#243129] px-[13px] text-[#dbe6dd] shadow-[0_8px_24px_rgba(0,0,0,.3)] [&_svg]:w-[15px]" onClick={() => setPausedLines(null)}><ArrowDown aria-hidden="true" /> Return to live output</button> : null}
      </section>
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

function lineTone(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("[error]") || lower.includes("exception")) return "text-[#e6867d]";
  if (lower.includes("[warn]")) return "text-[#d8b56d]";
  return "";
}

function formatConsoleTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour12: false });
}
