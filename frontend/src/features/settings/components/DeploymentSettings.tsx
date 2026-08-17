import { ServerCog } from "lucide-react";
import { Card } from "@/components/ui";
import { formatBytes } from "@/formatters";
import type { SettingsData } from "../settings.schemas";

export function DeploymentSettings({ settings }: { settings: SettingsData["deployment"] }) {
  return (
    <Card className="settings-section">
      <div className="settings-section__heading">
        <div className="settings-icon"><ServerCog aria-hidden="true" /></div>
        <div><p className="eyebrow">Restart required</p><h2>Deployment boundaries</h2><p>These values come from the host environment and cannot be widened from the browser.</p></div>
      </div>
      <dl className="deployment-grid">
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
