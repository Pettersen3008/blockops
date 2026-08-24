import { ChevronRight, Menu, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { navigationItemFor } from "@/app/routing/routes";
import { useTheme } from "@/app/providers/theme-provider";

export function AppHeader({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const selected = navigationItemFor(location.pathname);

  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center gap-4 border-b border-border bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-8 backdrop-blur-[16px] max-[900px]:px-[18px]">
      <Button variant="ghost" className="size-[42px] min-w-[42px] p-0 min-[901px]:hidden" onClick={onOpenNavigation} aria-label="Open navigation">
        <Menu aria-hidden="true" />
      </Button>
      <div className="flex min-w-0 items-center gap-2 text-[0.82rem] text-muted-foreground max-[660px]:[&>span]:hidden max-[660px]:[&>svg]:hidden"><span>Single server</span><ChevronRight className="size-[14px]" aria-hidden="true" /><strong className="text-foreground">{selected?.label ?? "Not found"}</strong></div>
      <Button
        variant="ghost"
        className="ml-auto size-[42px] min-w-[42px] p-0"
        onClick={toggleTheme}
        aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
    </header>
  );
}
