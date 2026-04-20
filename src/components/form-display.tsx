import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, CheckIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Switch } from '~/components/ui/switch'
import { Calendar } from '~/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import type { FormSpec, FormField } from '~/lib/form-tool'
import { cn } from '~/lib/utils'

/**
 * Form dates are serialized as ISO-like "YYYY-MM-DD" strings (matching the
 * native <input type="date"> contract so back-end consumers don't have to
 * change). The picker converts between that string and a `Date` at render
 * time, treating the value as a local date (no timezone math).
 */
function parseDateString(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const [, y, mo, d] = m
  return new Date(Number(y), Number(mo) - 1, Number(d))
}

function formatDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type FieldValues = Record<string, string | number | boolean>
const FORM_DRAFT_STORAGE_PREFIX = 'hashit:form-draft:'

const controlBase =
  'h-10 rounded-md border-border/70 bg-background/60 text-sm shadow-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60'

/**
 * Fields that naturally want the full form width: multi-line text, long
 * selects, and toggles. Everything else sits in a responsive 2-col grid so
 * short inputs (IDs, dates, names) stop stretching across the whole card.
 */
function isFullWidthField(field: FormField): boolean {
  if (field.type === 'textarea' || field.type === 'checkbox') return true
  if (field.type === 'select' && (field.options?.length ?? 0) > 6) return true
  return false
}

function FieldLabel({
  id,
  label,
  required,
}: {
  id: string
  label: string
  required?: boolean
}) {
  return (
    <Label
      htmlFor={id}
      className="text-[12.5px] font-medium leading-none tracking-tight text-foreground/90"
    >
      {label}
      {required && (
        <span className="ml-0.5 text-destructive/90" aria-hidden>
          *
        </span>
      )}
    </Label>
  )
}

/**
 * Radix Select.Item must not use value=""; LLM-generated options can include "".
 * We use stable index-based values for items and map back to semantic option values.
 */
function selectRadixPrefix(fieldName: string): string {
  return `__form_sel__${fieldName}__`
}

function selectIndexToRadixValue(fieldName: string, index: number): string {
  return `${selectRadixPrefix(fieldName)}${index}`
}

function parseSelectRadixToIndex(fieldName: string, radixValue: string): number {
  const p = selectRadixPrefix(fieldName)
  if (!radixValue.startsWith(p)) return -1
  const n = Number(radixValue.slice(p.length))
  return Number.isFinite(n) ? n : -1
}

function selectSemanticToRadixValue(
  field: Extract<FormSpec['fields'][number], { type: 'select' }>,
  semantic: string,
): string | undefined {
  const idx = field.options?.findIndex((o) => o.value === semantic) ?? -1
  if (idx < 0) return undefined
  return selectIndexToRadixValue(field.name, idx)
}

function initValues(
  fields: FormSpec['fields'],
  submittedData?: Record<string, unknown>,
): FieldValues {
  const vals: FieldValues = {}
  for (const f of fields) {
    if (submittedData && f.name in submittedData) {
      const raw = submittedData[f.name]
      if (
        typeof raw === 'string' ||
        typeof raw === 'number' ||
        typeof raw === 'boolean'
      ) {
        vals[f.name] = raw
      } else {
        vals[f.name] = ''
      }
    } else if (f.defaultValue !== undefined) {
      vals[f.name] = f.defaultValue
    } else if (f.type === 'checkbox') {
      vals[f.name] = false
    } else if (f.type === 'number') {
      vals[f.name] = ''
    } else {
      vals[f.name] = ''
    }
  }
  return vals
}

function readDraftValues(
  fields: FormSpec['fields'],
  draftStorageKey?: string,
): FieldValues | undefined {
  if (!draftStorageKey || typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(
      `${FORM_DRAFT_STORAGE_PREFIX}${draftStorageKey}`,
    )
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return undefined

    const next = initValues(fields)
    for (const field of fields) {
      const value = parsed[field.name]
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        next[field.name] = value
      }
    }
    return next
  } catch {
    return undefined
  }
}

export function FormDisplay({
  spec,
  onSubmit,
  disabled = false,
  submittedData,
  draftStorageKey,
}: {
  spec: FormSpec
  onSubmit?: (data: FieldValues) => void
  disabled?: boolean
  submittedData?: Record<string, unknown>
  draftStorageKey?: string
}) {
  const isSubmitted = disabled || !!submittedData
  const [values, setValues] = useState<FieldValues>(() =>
    readDraftValues(spec.fields, draftStorageKey) ??
    initValues(spec.fields, submittedData),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const displayedValues = useMemo(
    () => (submittedData ? initValues(spec.fields, submittedData) : values),
    [spec.fields, submittedData, values],
  )
  const storageKey = draftStorageKey
    ? `${FORM_DRAFT_STORAGE_PREFIX}${draftStorageKey}`
    : undefined

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    if (isSubmitted) {
      window.localStorage.removeItem(storageKey)
      return
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(values))
    } catch {
      // Best-effort draft persistence.
    }
  }, [isSubmitted, storageKey, values])

  const requiredCount = useMemo(
    () => spec.fields.filter((f) => f.required).length,
    [spec.fields],
  )

  function setValue(name: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    for (const f of spec.fields) {
      if (f.required) {
        const val = values[f.name]
        const empty =
          val === '' || val === null || val === undefined || val === false
        if (empty) {
          newErrors[f.name] = `${f.label} is required`
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    onSubmit?.(values)
  }

  return (
    <div
      data-slot="form-card"
      className="w-full max-w-xl overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm ring-1 ring-foreground/[0.04]"
    >
      <header className="px-5 pt-4 pb-3">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-balance text-foreground">
          {spec.title}
        </h3>
        {spec.description && (
          <p className="mt-1 text-[13px] leading-relaxed text-pretty text-muted-foreground">
            {spec.description}
          </p>
        )}
      </header>
      <div className="h-px bg-border/60" />

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 px-5 py-4 sm:grid-cols-2">
          {spec.fields.map((field) => {
            const value = displayedValues[field.name]
            const error = isSubmitted ? undefined : errors[field.name]
            const fullWidth = isFullWidthField(field)
            const wrapperClass = cn(
              'flex min-w-0 flex-col gap-1.5',
              fullWidth && 'sm:col-span-2',
            )

            if (field.type === 'checkbox') {
              return (
                <div
                  key={field.name}
                  className={cn(
                    'flex min-h-10 items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2',
                    fullWidth && 'sm:col-span-2',
                  )}
                >
                  <Label
                    htmlFor={field.name}
                    className="cursor-pointer text-[13px] leading-snug text-foreground"
                  >
                    {field.label}
                    {field.required && (
                      <span className="ml-0.5 text-destructive/90" aria-hidden>
                        *
                      </span>
                    )}
                  </Label>
                  <Switch
                    id={field.name}
                    checked={value === true}
                    onCheckedChange={(checked) => setValue(field.name, checked)}
                    disabled={isSubmitted}
                  />
                </div>
              )
            }

            if (field.type === 'select') {
              const stringVal = typeof value === 'string' ? value : ''
              const radixValue = selectSemanticToRadixValue(field, stringVal)
              return (
                <div key={field.name} className={wrapperClass}>
                  <FieldLabel
                    id={field.name}
                    label={field.label}
                    required={field.required}
                  />
                  <Select
                    value={radixValue}
                    onValueChange={(v) => {
                      const idx = parseSelectRadixToIndex(field.name, v)
                      const opt = field.options?.[idx]
                      if (opt) setValue(field.name, opt.value)
                    }}
                    disabled={isSubmitted}
                  >
                    <SelectTrigger
                      id={field.name}
                      className={cn('w-full', controlBase)}
                      aria-invalid={!!error}
                    >
                      <SelectValue
                        placeholder={field.placeholder ?? 'Select an option'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt, optIndex) => (
                        <SelectItem
                          key={`${field.name}-${optIndex}`}
                          value={selectIndexToRadixValue(field.name, optIndex)}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {error && (
                    <p className="text-[11.5px] leading-tight text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              )
            }

            if (field.type === 'textarea') {
              return (
                <div key={field.name} className={wrapperClass}>
                  <FieldLabel
                    id={field.name}
                    label={field.label}
                    required={field.required}
                  />
                  <Textarea
                    id={field.name}
                    value={typeof value === 'string' ? value : ''}
                    placeholder={field.placeholder}
                    disabled={isSubmitted}
                    aria-invalid={!!error}
                    className={cn(
                      'min-h-[88px] resize-y rounded-md border-border/70 bg-background/60 text-sm shadow-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60',
                      error && 'border-destructive',
                    )}
                    onChange={(e) => setValue(field.name, e.target.value)}
                    rows={3}
                  />
                  {error && (
                    <p className="text-[11.5px] leading-tight text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              )
            }

            if (field.type === 'date') {
              const stringVal = typeof value === 'string' ? value : ''
              const selected = parseDateString(stringVal)
              return (
                <div key={field.name} className={wrapperClass}>
                  <FieldLabel
                    id={field.name}
                    label={field.label}
                    required={field.required}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id={field.name}
                        type="button"
                        variant="outline"
                        disabled={isSubmitted}
                        data-empty={!selected}
                        aria-invalid={!!error}
                        className={cn(
                          controlBase,
                          'w-full justify-between px-3 font-normal data-[empty=true]:text-muted-foreground/70',
                          error && 'border-destructive',
                        )}
                      >
                        {selected ? (
                          format(selected, 'PPP')
                        ) : (
                          <span>{field.placeholder ?? 'Pick a date'}</span>
                        )}
                        <CalendarIcon className="size-4 opacity-60" aria-hidden />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto overflow-hidden p-0"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected}
                        captionLayout="dropdown"
                        onSelect={(d) => {
                          if (d) setValue(field.name, formatDateString(d))
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  {error && (
                    <p className="text-[11.5px] leading-tight text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              )
            }

            // text, email, number
            return (
              <div key={field.name} className={wrapperClass}>
                <FieldLabel
                  id={field.name}
                  label={field.label}
                  required={field.required}
                />
                <Input
                  id={field.name}
                  type={field.type}
                  value={
                    typeof value === 'string' || typeof value === 'number'
                      ? String(value)
                      : ''
                  }
                  placeholder={field.placeholder}
                  disabled={isSubmitted}
                  aria-invalid={!!error}
                  className={cn(controlBase, error && 'border-destructive')}
                  onChange={(e) => {
                    const raw = e.target.value
                    setValue(
                      field.name,
                      field.type === 'number'
                        ? raw === ''
                          ? ''
                          : Number(raw)
                        : raw,
                    )
                  }}
                />
                {error && (
                  <p className="text-[11.5px] leading-tight text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/15 px-5 py-3">
          <p className="text-[11.5px] leading-none text-muted-foreground">
            {requiredCount > 0
              ? `${requiredCount} required ${requiredCount === 1 ? 'field' : 'fields'}`
              : ''}
          </p>
          {isSubmitted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
              <CheckIcon className="size-3.5" aria-hidden />
              Submitted
            </span>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={!onSubmit}
              className="h-8 min-w-24 px-4 text-[13px] font-medium"
            >
              {spec.submitLabel ?? 'Submit'}
            </Button>
          )}
        </footer>
      </form>
    </div>
  )
}
