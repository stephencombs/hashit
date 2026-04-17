import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

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
