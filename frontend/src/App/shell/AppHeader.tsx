import { ChevronRight, Menu, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { navigationItemFor } from "@/App/routing/routes";
import { useTheme } from "@/App/providers/ThemeProvider";

export function AppHeader({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const selected = navigationItemFor(location.pathname);

  return (
    <header className="topbar">
      <Button variant="ghost" className="icon-button topbar__menu" onClick={onOpenNavigation} aria-label="Open navigation">
        <Menu aria-hidden="true" />
      </Button>
      <div className="breadcrumb"><span>Single server</span><ChevronRight aria-hidden="true" /><strong>{selected?.label ?? "Not found"}</strong></div>
      <Button
        variant="ghost"
        className="icon-button"
        onClick={toggleTheme}
        aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
    </header>
  );
}
