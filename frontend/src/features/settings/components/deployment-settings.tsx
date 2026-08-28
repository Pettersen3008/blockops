import { ServerCog } from "lucide-react";
import { Card } from "@blockops/ui";
import { formatBytes } from "@/formatters";
import type { SettingsData } from "../settings-schema";

export function DeploymentSettings({ settings }: { settings: SettingsData["deployment"] }) {
  return (
    <Card className="min-w-0 p-6 [overflow-wrap:anywhere] max-[660px]:p-[18px]">
      <div className="grid grid-cols-[48px_1fr_auto] items-start gap-3.5 border-b border-border pb-5 max-[660px]:grid-cols-[44px_1fr] [&>div]:min-w-0">
        <div className="grid size-11 place-items-center rounded-xl bg-accent text-primary-hover [&_svg]:w-[21px]"><ServerCog aria-hidden="true" /></div>
        <div><p className="mb-[7px] text-[0.72rem] font-medium tracking-[0.13em] text-primary uppercase">Restart required</p><h2 className="mb-1 text-xl">Deployment boundaries</h2><p className="m-0 text-muted-foreground">These values come from the host environment and cannot be widened from the browser.</p></div>
      </div>
      <dl className="m-0 grid grid-cols-3 max-[900px]:grid-cols-2 max-[660px]:grid-cols-1 [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:truncate [&_dd]:font-semibold [&_div]:min-w-0 [&_div]:border-b [&_div]:border-border [&_div]:px-3.5 [&_div]:py-[18px] [&_dt]:mb-1.5 [&_dt]:text-xs [&_dt]:text-muted-foreground">
        <div><dt>Minecraft container</dt><dd><code>{settings.minecraftContainer}</code></dd></div>
        <div><dt>World name</dt><dd><code>{settings.worldName}</code></dd></div>
        <div><dt>Upload limit</dt><dd>{formatBytes(settings.maxUploadBytes)}</dd></div>
        <div><dt>Secure cookies</dt><dd>{settings.cookieSecure ? "Required" : "Disabled (development only)"}</dd></div>
        <div><dt>Trusted proxy ranges</dt><dd>{settings.trustedProxyCount}</dd></div>
        <div><dt>Host shell</dt><dd>Not available</dd></div>
      </dl>
    </Card>
  );
}
