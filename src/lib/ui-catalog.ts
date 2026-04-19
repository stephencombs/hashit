import { defineCatalog, validateSpec as validateSpecStructure } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'
import type { Spec } from '@json-render/core'

export const uiCatalog = defineCatalog(schema, {
  components: {
    AreaChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKeys: z.array(z.string()),
        stacked: z.boolean().nullable(),
        curveType: z
          .enum(['monotone', 'linear', 'step', 'natural'])
          .nullable(),
        height: z.number().nullable(),
      }),
      description:
        'Area chart with gradient fill. Supports multiple series via yKeys. Use stacked=true for stacked areas. curveType controls interpolation.',
    },

    BarChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKeys: z.array(z.string()),
        horizontal: z.boolean().nullable(),
        stacked: z.boolean().nullable(),
        height: z.number().nullable(),
      }),
      description:
        'Bar chart for comparing categories. Supports multiple series via yKeys. Use horizontal=true for horizontal bars, stacked=true for stacked bars.',
    },

    LineChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKeys: z.array(z.string()),
        curveType: z
          .enum(['monotone', 'linear', 'step', 'natural'])
          .nullable(),
        height: z.number().nullable(),
      }),
      description:
        'Line chart for trends and time-series. Supports multiple series via yKeys. curveType controls interpolation.',
    },

    PieChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        nameKey: z.string(),
        valueKey: z.string(),
        donut: z.boolean().nullable(),
        height: z.number().nullable(),
      }),
      description:
        'Pie chart for proportional data. Use donut=true for a donut chart with inner radius.',
    },

    RadarChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        axisKey: z.string(),
        dataKeys: z.array(z.string()),
        height: z.number().nullable(),
      }),
      description:
        'Radar/spider chart for multivariate comparison. axisKey labels the spokes, dataKeys are the value fields to overlay.',
    },

    RadialChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        nameKey: z.string(),
        valueKey: z.string(),
        height: z.number().nullable(),
      }),
      description:
        'Radial bar chart for displaying values as arcs around a center point.',
    },

    DataGrid: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        columns: z
          .array(
            z.object({
              field: z.string(),
              headerName: z.string().nullable(),
              width: z.number().nullable(),
              sortable: z.boolean().nullable(),
              filter: z.boolean().nullable(),
            }),
          )
          .nullable(),
        height: z.number().nullable(),
        pagination: z.boolean().nullable(),
        pageSize: z.number().nullable(),
      }),
      description:
        'Interactive data grid/table. Columns are auto-detected from data keys if not provided. Supports sorting, filtering, and optional pagination.',
    },
  },
  actions: {},
})

// ---------------------------------------------------------------------------
// Shared spec validation — used by both the chat stream path and the dashboard
// generator so catalog rules are enforced consistently in one place.
// ---------------------------------------------------------------------------

const SERIES_KEY_PROPS = ['yKeys', 'dataKeys'] as const

export type SpecValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Validates a compiled Spec against the structural schema and the catalog's
 * component/prop constraints. Returns `{ valid: true }` or an object with a
 * human-readable `reason` string.
 *
 * Checks performed (in order):
 *  1. Root + elements presence
 *  2. Structural issues from @json-render/core (errors only, warnings ignored)
 *  3. Catalog Zod validation (component props)
 *  4. Empty `data` array on any element
 *  5. Empty series key arrays (yKeys / dataKeys)
 */
export function validateWidgetSpec(spec: Spec | null): SpecValidationResult {
  if (!spec || !spec.root || !spec.elements) {
    return { valid: false, reason: 'Spec missing root or elements' }
  }

  const structuralErrors = validateSpecStructure(spec).issues.filter(
    (i) => i.severity === 'error',
  )
  if (structuralErrors.length > 0) {
    return {
      valid: false,
      reason: `Structural: ${structuralErrors.map((e) => e.message).join('; ')}`,
    }
  }

  // Normalize: add `children: []` to elements that omit it. The JSON Render
  // base element schema requires the field, but LLM-generated leaf components
  // (charts, DataGrid) omit it because they have no children. Normalizing here
  // lets us run the full catalog/prop check without false negatives.
  const normalizedSpec: Spec = {
    ...spec,
    elements: Object.fromEntries(
      Object.entries(spec.elements).map(([k, el]) => [k, { children: [], ...el }]),
    ),
  }
  const catalogResult = uiCatalog.validate(normalizedSpec)
  if (!catalogResult.success) {
    const first = catalogResult.error?.issues?.[0]
    const detail = first
      ? `${first.path.join('.')}: ${first.message}`
      : catalogResult.error?.message ?? 'unknown zod error'
    return { valid: false, reason: `Props/catalog: ${detail.slice(0, 240)}` }
  }

  for (const [key, element] of Object.entries(spec.elements)) {
    const props = (element.props ?? {}) as Record<string, unknown>
    if (Array.isArray(props.data) && props.data.length === 0) {
      return { valid: false, reason: `${element.type} "${key}" has empty data array` }
    }
    for (const seriesKey of SERIES_KEY_PROPS) {
      const val = props[seriesKey]
      if (Array.isArray(val) && val.length === 0) {
        return { valid: false, reason: `${element.type} "${key}" has empty ${seriesKey}` }
      }
    }
  }

  return { valid: true }
}
