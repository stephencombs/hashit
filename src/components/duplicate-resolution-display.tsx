import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type {
  DuplicateField,
  DuplicateResolutionSpec,
  ResolutionOutput,
} from "~/lib/resolve-duplicate-tool";
import { cn } from "~/lib/utils";

/**
 * Dates are round-tripped as "YYYY-MM-DD" strings — same contract as FormDisplay.
 */
function parseDateString(value: unknown): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function formatDisplayValue(
  value: string | number | boolean | undefined,
): string {
  if (value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function selectRadixPrefix(fieldName: string): string {
  return `__dup_sel__${fieldName}__`;
}

function selectIndexToRadixValue(fieldName: string, index: number): string {
  return `${selectRadixPrefix(fieldName)}${index}`;
}

function parseSelectRadixToIndex(
  fieldName: string,
  radixValue: string,
): number {
  const p = selectRadixPrefix(fieldName);
  if (!radixValue.startsWith(p)) return -1;
  const n = Number(radixValue.slice(p.length));
  return Number.isFinite(n) ? n : -1;
}

function selectSemanticToRadixValue(
  field: DuplicateField & { type: "select" },
  semantic: string,
): string | undefined {
  const idx = field.options?.findIndex((o) => o.value === semantic) ?? -1;
  if (idx < 0) return undefined;
  return selectIndexToRadixValue(field.name, idx);
}

type FieldValues = Record<string, string | number | boolean>;

function initValues(fields: DuplicateField[]): FieldValues {
  const vals: FieldValues = {};
  for (const f of fields) {
    const initial = f.proposedValue ?? f.currentValue;
    if (
      typeof initial === "string" ||
      typeof initial === "number" ||
      typeof initial === "boolean"
    ) {
      vals[f.name] = initial;
    } else {
      vals[f.name] = "";
    }
  }
  return vals;
}

function initValuesFromSubmission(
  fields: DuplicateField[],
  submittedData?: Record<string, unknown>,
): FieldValues | undefined {
  if (!submittedData || typeof submittedData !== "object") return undefined;

  const rawValues =
    "values" in submittedData &&
    submittedData.values &&
    typeof submittedData.values === "object"
      ? (submittedData.values as Record<string, unknown>)
      : null;

  if (!rawValues) return undefined;

  const vals = initValues(fields);
  for (const field of fields) {
    const raw = rawValues[field.name];
    if (
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean"
    ) {
      vals[field.name] = raw;
    }
  }

  return vals;
}

function computeChanges(
  initial: FieldValues,
  current: FieldValues,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(current)) {
    if (current[key] !== initial[key]) {
      changes[key] = { from: initial[key], to: current[key] };
    }
  }
  return changes;
}

const controlBase =
  "h-10 rounded-md border-border/70 bg-background/60 text-sm shadow-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60";

function FieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: DuplicateField;
  value: string | number | boolean;
  error?: string;
  disabled: boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const editable = field.editable !== false && field.type !== "readonly";

  if (field.type === "readonly" || !editable) {
    return (
      <p className="border-border/40 bg-muted/20 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm">
        {formatDisplayValue(value)}
      </p>
    );
  }

  if (field.type === "select") {
    const stringVal = typeof value === "string" ? value : "";
    const radixValue = selectSemanticToRadixValue(
      field as DuplicateField & { type: "select" },
      stringVal,
    );
    return (
      <Select
        value={radixValue}
        onValueChange={(v) => {
          const idx = parseSelectRadixToIndex(field.name, v);
          const opt = field.options?.[idx];
          if (opt) onChange(opt.value);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={field.name}
          className={cn("w-full", controlBase, error && "border-destructive")}
          aria-invalid={!!error}
        >
          <SelectValue placeholder={field.placeholder ?? "Select an option"} />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((opt, i) => (
            <SelectItem
              key={`${field.name}-${i}`}
              value={selectIndexToRadixValue(field.name, i)}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        id={field.name}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        disabled={disabled}
        aria-invalid={!!error}
        className={cn(
          "min-h-[80px] resize-y rounded-md border-border/70 bg-background/60 text-sm shadow-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60",
          error && "border-destructive",
        )}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }

  if (field.type === "date") {
    const stringVal = typeof value === "string" ? value : "";
    const selected = parseDateString(stringVal);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={field.name}
            type="button"
            variant="outline"
            disabled={disabled}
            data-empty={!selected}
            aria-invalid={!!error}
            className={cn(
              controlBase,
              "w-full justify-between px-3 font-normal data-[empty=true]:text-muted-foreground/70",
              error && "border-destructive",
            )}
          >
            {selected ? (
              format(selected, "PPP")
            ) : (
              <span>{field.placeholder ?? "Pick a date"}</span>
            )}
            <CalendarIcon className="size-4 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            onSelect={(d) => {
              if (d) onChange(formatDateString(d));
            }}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // text, email, number
  return (
    <Input
      id={field.name}
      type={field.type}
      value={
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : ""
      }
      placeholder={field.placeholder}
      disabled={disabled}
      aria-invalid={!!error}
      className={cn(controlBase, error && "border-destructive")}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(
          field.type === "number" ? (raw === "" ? "" : Number(raw)) : raw,
        );
      }}
    />
  );
}

export function DuplicateResolutionDisplay({
  spec,
  onResolve,
  disabled = false,
  submittedData,
}: {
  spec: DuplicateResolutionSpec;
  onResolve?: (output: ResolutionOutput) => void;
  disabled?: boolean;
  submittedData?: Record<string, unknown>;
}) {
  const isSubmitted = disabled || !!submittedData;

  const initialValues = useMemo(() => initValues(spec.fields), [spec.fields]);
  const [values, setValues] = useState<FieldValues>(() => initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const displayedValues = useMemo(
    () => initValuesFromSubmission(spec.fields, submittedData) ?? values,
    [spec.fields, submittedData, values],
  );

  function setValue(name: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function handleAction(actionId: string, requiresEdits: boolean) {
    if (requiresEdits) {
      const newErrors: Record<string, string> = {};
      for (const f of spec.fields) {
        if (f.required && f.editable !== false && f.type !== "readonly") {
          const val = values[f.name];
          if (val === "" || val === null || val === undefined) {
            newErrors[f.name] = `${f.label} is required`;
          }
        }
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }

    const changes = computeChanges(initialValues, values);
    onResolve?.({ actionId, values, changes });
  }

  const editableCount = spec.fields.filter(
    (f) => f.editable !== false && f.type !== "readonly",
  ).length;

  const conflictingFields = spec.fields.filter((f) => f.conflicting);

  const submittedActionId =
    submittedData &&
    typeof submittedData === "object" &&
    "actionId" in submittedData
      ? String((submittedData as Record<string, unknown>).actionId)
      : undefined;

  const displayedAction =
    spec.actions?.find((a) => a.id === submittedActionId) ?? null;

  return (
    <div
      data-slot="resolution-card"
      className="border-border/60 bg-card text-card-foreground ring-foreground/[0.04] w-full max-w-xl overflow-hidden rounded-xl border shadow-sm ring-1"
    >
      {/* Header */}
      <header className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <TriangleAlertIcon
            className="text-destructive/70 mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <h3 className="text-foreground text-[15px] leading-snug font-semibold tracking-tight text-balance">
            {spec.title}
          </h3>
        </div>
        {spec.description && (
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed text-pretty">
            {spec.description}
          </p>
        )}
        {spec.conflictReason && (
          <div className="border-destructive/20 bg-destructive/[0.06] mt-2 flex items-start gap-1.5 rounded-md border px-2.5 py-1.5">
            <AlertCircleIcon
              className="text-destructive/70 mt-px size-3.5 shrink-0"
              aria-hidden
            />
            <p className="text-destructive/80 text-[11.5px] leading-relaxed">
              {spec.conflictReason}
            </p>
          </div>
        )}
      </header>
      <div className="bg-border/60 h-px" />

      {/* Field table */}
      <div className="px-5 py-4">
        {/* Column headers */}
        <div className="text-muted-foreground/70 mb-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 text-[11px] font-medium tracking-wider uppercase">
          <span>Current value</span>
          <span>New value</span>
        </div>
        <div className="flex flex-col gap-3.5">
          {spec.fields.map((field) => {
            const value = displayedValues[field.name];
            const error = isSubmitted ? undefined : errors[field.name];
            const isConflicting = field.conflicting === true;
            const editable =
              field.editable !== false && field.type !== "readonly";

            return (
              <div key={field.name} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Label
                    htmlFor={field.name}
                    className={cn(
                      "text-[12.5px] font-medium tracking-tight",
                      isConflicting
                        ? "text-destructive/90"
                        : "text-foreground/90",
                    )}
                  >
                    {field.label}
                    {field.required && editable && (
                      <span className="text-destructive/90 ml-0.5" aria-hidden>
                        *
                      </span>
                    )}
                  </Label>
                  {isConflicting && (
                    <span className="bg-destructive/10 text-destructive/80 ring-destructive/20 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset">
                      conflict
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4",
                    isConflicting &&
                      "rounded-lg border border-destructive/20 bg-destructive/[0.03] p-2",
                  )}
                >
                  {/* Current value (read-only left column) */}
                  <p
                    className={cn(
                      "flex h-10 items-center rounded-md border border-border/40 px-3 text-sm",
                      isConflicting
                        ? "bg-destructive/[0.06] text-destructive/80"
                        : "bg-muted/20 text-muted-foreground",
                    )}
                  >
                    {formatDisplayValue(field.currentValue)}
                  </p>
                  {/* Proposed value (editable right column) */}
                  <div className="flex flex-col gap-1">
                    {isSubmitted ? (
                      <p className="border-border/40 bg-muted/20 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm">
                        {formatDisplayValue(value)}
                      </p>
                    ) : (
                      <FieldControl
                        field={field}
                        value={value}
                        error={error}
                        disabled={isSubmitted}
                        onChange={(v) => setValue(field.name, v)}
                      />
                    )}
                    {error && (
                      <p className="text-destructive text-[11.5px] leading-tight">
                        {error}
                      </p>
                    )}
                  </div>
                </div>
                {field.helpText && !isSubmitted && (
                  <p className="text-muted-foreground/80 text-[11.5px] leading-snug">
                    {field.helpText}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-border/60 bg-muted/15 flex items-center justify-between gap-3 border-t px-5 py-3">
        {isSubmitted ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400">
              <CheckIcon className="size-3.5" aria-hidden />
              {displayedAction ? displayedAction.label : "Resolved"}
            </span>
            <p className="text-muted-foreground text-[11.5px]">
              {conflictingFields.length > 0
                ? `${conflictingFields.map((f) => f.label).join(", ")} resolved`
                : ""}
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-[11.5px] leading-none">
              {editableCount > 0
                ? `${editableCount} editable ${editableCount === 1 ? "field" : "fields"}`
                : ""}
            </p>
            <div className="flex items-center gap-2">
              {/* Cancel is always present as a ghost button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-[13px]"
                disabled={!onResolve}
                onClick={() =>
                  onResolve?.({ actionId: "cancel", values: {}, changes: {} })
                }
              >
                Cancel
              </Button>
              {spec.actions && spec.actions.length > 0 ? (
                spec.actions.map((action) => (
                  <Button
                    key={action.id}
                    type="button"
                    size="sm"
                    variant={
                      action.variant === "destructive"
                        ? "destructive"
                        : action.variant === "secondary"
                          ? "outline"
                          : "default"
                    }
                    className="h-8 min-w-24 px-4 text-[13px] font-medium"
                    disabled={!onResolve}
                    title={action.description}
                    onClick={() =>
                      handleAction(action.id, action.requiresEdits ?? false)
                    }
                  >
                    {action.label}
                  </Button>
                ))
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 min-w-24 px-4 text-[13px] font-medium"
                  disabled={!onResolve}
                  onClick={() => handleAction("submit", true)}
                >
                  Submit
                </Button>
              )}
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
