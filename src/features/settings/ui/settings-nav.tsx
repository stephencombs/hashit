import { Link } from "@tanstack/react-router";
import { BrainIcon, DatabaseIcon, PaletteIcon, ServerIcon } from "lucide-react";
import { cn } from "~/shared/lib/utils";

const sections = [
  { to: "/settings/appearance", label: "Appearance", icon: PaletteIcon },
  { to: "/settings/model", label: "Model", icon: BrainIcon },
  { to: "/settings/mcp", label: "MCP Servers", icon: ServerIcon },
  { to: "/settings/data", label: "Data", icon: DatabaseIcon },
] as const;

export function SettingsNav() {
  return (
    <nav className="flex w-48 shrink-0 flex-col gap-1 border-r p-4">
      {sections.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: true }}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          )}
          activeProps={{
            className: "bg-muted text-foreground",
          }}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
