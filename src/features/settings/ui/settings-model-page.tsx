import { Input } from "~/shared/ui/input";
import { Label } from "~/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/shared/ui/select";
import { Separator } from "~/shared/ui/separator";
import { Textarea } from "~/shared/ui/textarea";
import { useModelSettings } from "~/shared/hooks/use-model-settings";

const models = [
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
  { value: "gpt-5.2", label: "GPT-5.2" },
] as const;

export function ModelSettingsPage() {
  const {
    model,
    setModel,
    temperature,
    setTemperature,
    systemPrompt,
    setSystemPrompt,
  } = useModelSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h2 className="text-lg font-semibold">Model</h2>
        <p className="text-muted-foreground text-sm">
          Configure the default AI model and generation parameters.
        </p>
      </div>

      <Separator />

      <div className="space-y-6">
        <div className="grid gap-2">
          <Label htmlFor="model">Default model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="model" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((modelOption) => (
                <SelectItem key={modelOption.value} value={modelOption.value}>
                  {modelOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="temperature">Temperature</Label>
            <span className="text-muted-foreground text-sm tabular-nums">
              {temperature.toFixed(1)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Controls randomness. Lower values are more deterministic.
          </p>
          <Input
            id="temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(event) =>
              setTemperature(parseFloat(event.currentTarget.value))
            }
            className="h-auto border-none bg-transparent px-0 shadow-none dark:bg-transparent"
          />
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>Precise (0)</span>
            <span>Creative (2)</span>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="system-prompt">System prompt</Label>
          <p className="text-muted-foreground text-sm">
            Instructions that guide the AI&apos;s behavior across all
            conversations.
          </p>
          <Textarea
            id="system-prompt"
            placeholder="You are a helpful assistant..."
            rows={5}
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.currentTarget.value)}
          />
        </div>
      </div>
    </div>
  );
}
