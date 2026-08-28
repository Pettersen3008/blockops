import { Menu, Moon, Sun } from "lucide-react";
import { Button, StatusPill } from "@blockops/ui";
import { formatDuration } from "@/formatters";
import { serverStateTone } from "@/features/overview";
import type { ServerIdentity } from "@/features/overview";
import { useTheme } from "@/app/providers/theme-provider";

export function AppHeader({
  server,
  onOpenNavigation,
}: {
  server: ServerIdentity;
  onOpenNavigation: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const software = [server.software, server.version].filter(Boolean).join(" ");

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-6 backdrop-blur-[16px] max-[900px]:px-4">
      <Button id="mobile-navigation-open" variant="ghost" className="size-[38px] min-w-[38px] p-0 min-[901px]:hidden" onClick={onOpenNavigation} aria-label="Open navigation">
        <Menu aria-hidden="true" />
      </Button>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2.5">
          <strong className="text-[0.95rem] tracking-[-0.01em]">Minecraft server</strong>
          <StatusPill tone={serverStateTone(server.state)}>{server.state}</StatusPill>
          {software ? <span className="text-[0.78rem] text-muted-foreground max-[660px]:hidden">{software}</span> : null}
        </div>
        <span className="text-[0.72rem] text-muted-foreground max-[660px]:hidden">
          uptime {formatDuration(server.uptimeSeconds)}
        </span>
      </div>
      <Button
        variant="ghost"
        className="ml-auto size-[38px] min-w-[38px] p-0"
        onClick={toggleTheme}
        aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
    </header>
  );
}
