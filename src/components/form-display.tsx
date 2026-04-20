import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Switch } from '~/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import type { FormSpec } from '~/lib/form-tool'

type FieldValues = Record<string, string | number | boolean>

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

export function FormDisplay({
  spec,
  onSubmit,
  disabled = false,
  submittedData,
}: {
  spec: FormSpec
  onSubmit?: (data: FieldValues) => void
  disabled?: boolean
  submittedData?: Record<string, unknown>
}) {
  const isSubmitted = disabled || !!submittedData
  const [values, setValues] = useState<FieldValues>(() =>
    initValues(spec.fields, submittedData),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

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
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
        {spec.description && (
          <CardDescription>{spec.description}</CardDescription>
        )}
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-5">
          {spec.fields.map((field) => {
            const value = values[field.name]
            const error = errors[field.name]

            if (field.type === 'checkbox') {
              return (
                <div key={field.name} className="flex items-center gap-3">
                  <Switch
                    id={field.name}
                    checked={value === true}
                    onCheckedChange={(checked) => setValue(field.name, checked)}
                    disabled={isSubmitted}
                  />
                  <Label htmlFor={field.name} className="cursor-pointer">
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-destructive">*</span>
                    )}
                  </Label>
                </div>
              )
            }

            if (field.type === 'select') {
              const stringVal = typeof value === 'string' ? value : ''
              const radixValue = selectSemanticToRadixValue(field, stringVal)
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-destructive">*</span>
                    )}
                  </Label>
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
                      className="w-full"
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
                    <p className="text-xs text-destructive">{error}</p>
                  )}
                </div>
              )
            }

            if (field.type === 'textarea') {
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-destructive">*</span>
                    )}
                  </Label>
                  <Textarea
                    id={field.name}
                    value={typeof value === 'string' ? value : ''}
                    placeholder={field.placeholder}
                    disabled={isSubmitted}
                    aria-invalid={!!error}
                    className={error ? 'border-destructive' : undefined}
                    onChange={(e) => setValue(field.name, e.target.value)}
                    rows={3}
                  />
                  {error && (
                    <p className="text-xs text-destructive">{error}</p>
                  )}
                </div>
              )
            }

            // text, email, number, date
            return (
              <div key={field.name} className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
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
                  className={error ? 'border-destructive' : undefined}
                  onChange={(e) => {
                    const raw = e.target.value
                    setValue(
                      field.name,
                      field.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw,
                    )
                  }}
                />
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
              </div>
            )
          })}
        </CardContent>

        <CardFooter className="border-t pt-4">
          {isSubmitted ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckIcon className="size-4 text-green-500" />
              <span>Submitted</span>
            </div>
          ) : (
            <Button type="submit" disabled={!onSubmit}>
              {spec.submitLabel ?? 'Submit'}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
