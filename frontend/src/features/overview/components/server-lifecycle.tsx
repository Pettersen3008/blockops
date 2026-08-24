import { Play, Power } from "lucide-react";
import { StatusPill } from "@/components/common/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDuration } from "@/formatters";
import type { Overview, ServerAction, ServerState } from "../overview-schema";
import { Unavailable } from "./unavailable";

export function ServerLifecycle({
  server,
  canControl,
  onAction,
}: {
  server: Overview["server"];
  canControl: boolean;
  onAction: (action: ServerAction) => void;
}) {
  const state = server.available ? server.value.state : "unknown";

  return (
    <Card className="relative grid min-w-0 grid-cols-[12px_1fr] overflow-hidden">
      <div
        className="flex flex-col gap-[3px] bg-muted px-[3px] py-[18px] [&>span]:min-h-5 [&>span]:flex-1 [&>span]:rounded-sm [&>span]:bg-input data-[state=offline]:[&>span]:bg-destructive data-[state=offline]:[&>span]:opacity-55 data-[state=online]:[&>span]:bg-primary-hover data-[state=online]:[&>span:nth-child(2)]:opacity-65 data-[state=online]:[&>span:nth-child(3)]:opacity-35"
        data-state={state}
        aria-hidden="true"
      >
        <span /><span /><span />
      </div>
      <div className="min-w-0 px-[26px] pt-6 pb-[18px] max-[660px]:px-[18px] max-[660px]:pt-5 max-[660px]:pb-3.5">
        <div className="flex justify-between gap-[18px] [&_h2]:text-[1.35rem]">
          <div>
            <p className="eyebrow">Configured Java server</p>
            <h2>{server.available ? "Minecraft server" : "Integration unavailable"}</h2>
          </div>
          <StatusPill tone={stateTone(state)}>{state}</StatusPill>
        </div>
        {server.available ? (
          <dl className="mt-[23px] mb-0 grid grid-cols-2 gap-4 min-[1181px]:grid-cols-4 [&_div]:min-w-0 [&_dt]:mb-[5px] [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:overflow-hidden [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:text-ellipsis [&_dd]:whitespace-nowrap">
            <div><dt>Software</dt><dd>{server.value.software || "Unavailable"}</dd></div>
            <div><dt>Version</dt><dd>{server.value.version || "Unavailable"}</dd></div>
            <div><dt>Uptime</dt><dd>{formatDuration(server.value.uptimeSeconds)}</dd></div>
            <div><dt>Container image</dt><dd title={server.value.image}>{server.value.image || "Unavailable"}</dd></div>
          </dl>
        ) : <Unavailable message={server.message} />}
      </div>
      {canControl ? (
        <div className="col-start-2 flex border-t border-border px-3.5 py-2" aria-label="Server lifecycle controls">
          <Button variant="ghost" onClick={() => onAction("start")} disabled={state === "online"}><Play aria-hidden="true" /> Start</Button>
          <Button variant="ghost" onClick={() => onAction("stop")} disabled={state === "offline"}><Power aria-hidden="true" /> Stop</Button>
        </div>
      ) : null}
    </Card>
  );
}

function stateTone(state: ServerState): "good" | "warn" | "bad" | "neutral" {
  if (state === "online") return "good";
  if (state === "starting" || state === "stopping") return "warn";
  if (state === "offline") return "bad";
  return "neutral";
}
