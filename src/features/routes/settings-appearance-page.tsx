import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { ButtonGroup } from "~/components/ui/button-group";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { useTheme } from "~/hooks/use-theme";

const themeOptions = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

export function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-muted-foreground text-sm">
          Customize how the app looks and feels.
        </p>
      </div>

      <Separator />

      <div className="space-y-6">
        <div className="grid gap-2">
          <Label htmlFor="theme">Theme</Label>
          <p className="text-muted-foreground text-sm">
            Choose between light and dark mode.
          </p>
          <ButtonGroup>
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? "secondary" : "outline"}
                size="sm"
                onClick={() => setTheme(value)}
              >
                <Icon data-icon="inline-start" />
                {label}
              </Button>
            ))}
          </ButtonGroup>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="font-size">Font size</Label>
          <p className="text-muted-foreground text-sm">
            Adjust the base font size for the interface.
          </p>
          <Select defaultValue="14">
            <SelectTrigger id="font-size" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">Small (12px)</SelectItem>
              <SelectItem value="14">Default (14px)</SelectItem>
              <SelectItem value="16">Large (16px)</SelectItem>
              <SelectItem value="18">Extra large (18px)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
