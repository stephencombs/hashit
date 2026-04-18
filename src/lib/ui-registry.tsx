import { createContext, memo, useContext, useEffect, useMemo, useState } from 'react'
import { defineRegistry } from '@json-render/react'
import { AllCommunityModule, themeQuartz, colorSchemeDarkBlue } from 'ag-grid-community'
import type { GridReadyEvent } from 'ag-grid-community'
import { AgGridProvider, AgGridReact } from 'ag-grid-react'

const AG_GRID_MODULES = [AllCommunityModule]
const AG_GRID_THEME_LIGHT = themeQuartz
const AG_GRID_THEME_DARK = themeQuartz.withPart(colorSchemeDarkBlue)
const AG_GRID_DEFAULT_COL_DEF = { resizable: true }

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'))
    })
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

interface DataGridColumnSpec {
  field: string
  headerName?: string | null
  sortable?: boolean | null
  filter?: boolean | null
}

interface DataGridInnerProps {
  items: Array<Record<string, unknown>>
  columns?: DataGridColumnSpec[] | null
  title?: string | null
  height?: number | null
  pagination?: boolean | null
  pageSize?: number | null
  fill: boolean
}

const DataGridInner = memo(function DataGridInner({
  items,
  columns,
  title,
  height,
  pagination,
  pageSize,
  fill,
}: DataGridInnerProps) {
  const columnKeys = useMemo(() => {
    if (columns && columns.length > 0) {
      return columns.map((c) => `${c.field}|${c.headerName ?? ''}|${c.sortable ?? ''}|${c.filter ?? ''}`).join(',')
    }
    if (items[0]) return Object.keys(items[0]).join(',')
    return ''
  }, [columns, items])

  const columnDefs = useMemo(() => {
    if (columns && columns.length > 0) {
      return columns.map((col) => ({
        field: col.field,
        headerName: col.headerName ?? col.field,
        sortable: col.sortable ?? true,
        filter: col.filter ?? true,
      }))
    }
    if (!items[0]) return []
    return Object.keys(items[0]).map((key) => ({
      field: key,
      headerName: key,
      sortable: true,
      filter: true,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnKeys])

  const usePagination = pagination ?? items.length > 50
  const isDark = useIsDarkMode()
  const gridTheme = isDark ? AG_GRID_THEME_DARK : AG_GRID_THEME_LIGHT
  const domLayout =
    fill || typeof height === 'number' ? 'normal' : 'autoHeight'

  return (
    <div className={chartWrapperClass(fill)}>
      {title && <p className="mb-2 text-sm font-medium">{title}</p>}
      <AgGridProvider modules={AG_GRID_MODULES}>
        <div {...dataGridInnerProps(fill, height)}>
          <AgGridReact
            theme={gridTheme}
            rowData={items}
            columnDefs={columnDefs}
            domLayout={domLayout}
            pagination={usePagination}
            paginationPageSize={pageSize ?? 10}
            defaultColDef={AG_GRID_DEFAULT_COL_DEF}
            onGridReady={(params: GridReadyEvent) => {
              params.api.autoSizeAllColumns()
              const cols = params.api.getColumns() ?? []
              const columnLimits = cols.map((c) => ({
                key: c.getColId(),
                minWidth: c.getActualWidth(),
              }))
              params.api.sizeColumnsToFit({ columnLimits })
            }}
          />
        </div>
      </AgGridProvider>
    </div>
  )
})
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart as RechartsRadarChart,
  RadialBar,
  RadialBarChart as RechartsRadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '~/components/ui/chart'
import { uiCatalog } from './ui-catalog'

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const FillModeContext = createContext(false)
export const FillModeProvider = FillModeContext.Provider
function useFillMode() {
  return useContext(FillModeContext)
}

function chartWrapperClass(fill: boolean): string | undefined {
  return fill ? 'flex h-full w-full flex-col' : undefined
}

function chartContainerProps(
  fill: boolean,
  height: number | null | undefined,
): { className?: string; style?: React.CSSProperties } {
  if (fill) {
    return { className: 'aspect-auto w-full flex-1 min-h-[200px]' }
  }
  const minHeight = Math.max(200, height ?? 250)
  return { style: { minHeight, width: '100%' } }
}

function dataGridInnerProps(
  fill: boolean,
  height: number | null | undefined,
): { className?: string; style?: React.CSSProperties } {
  if (fill) return { className: 'flex-1 min-h-[320px] w-full' }
  if (typeof height === 'number') return { style: { height } }
  return { className: 'w-full' }
}

function cssKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
}

function buildChartConfig(keys: string[]): ChartConfig {
  const config: ChartConfig = {}
  keys.forEach((key, i) => {
    config[cssKey(key)] = { label: key, color: COLORS[i % COLORS.length] }
  })
  return config
}

function FallbackMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
  )
}

function rowHas(items: Array<Record<string, unknown>>, key: string): boolean {
  if (!key) return false
  return items.some((row) => row != null && typeof row === 'object' && key in row)
}

function missingKeys(items: Array<Record<string, unknown>>, keys: string[]): string[] {
  return keys.filter((k) => !rowHas(items, k))
}

export const { registry: uiRegistry } = defineRegistry(uiCatalog, {
  components: {
    AreaChart: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.yKeys ?? []
      const config = buildChartConfig(keys)
      const curve = props.curveType ?? 'monotone'

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }
      if (keys.length === 0) {
        return <FallbackMessage>Unable to plot: no series specified (yKeys empty).</FallbackMessage>
      }
      const missing = missingKeys(items, keys)
      if (missing.length === keys.length || !rowHas(items, props.xKey)) {
        return (
          <FallbackMessage>
            Unable to plot: series fields ({[props.xKey, ...missing].filter(Boolean).join(', ')}) not found in data.
          </FallbackMessage>
        )
      }

      return (
        <div className={chartWrapperClass(fill)}>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} {...chartContainerProps(fill, props.height)}>
            <RechartsAreaChart data={items} accessibilityLayer isAnimationActive={false}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={props.xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                isAnimationActive={false}
              />
              {keys.length > 1 && (
                <ChartLegend content={<ChartLegendContent />} />
              )}
              <defs>
                {keys.map((key, i) => (
                  <linearGradient
                    key={key}
                    id={`fill-${cssKey(key)}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={COLORS[i % COLORS.length]}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={COLORS[i % COLORS.length]}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                ))}
              </defs>
              {keys.map((key) => (
                <Area
                  key={key}
                  dataKey={key}
                  type={curve}
                  fill={`url(#fill-${cssKey(key)})`}
                  stroke={`var(--color-${cssKey(key)})`}
                  strokeWidth={2}
                  stackId={props.stacked ? 'a' : undefined}
                  isAnimationActive={false}
                />
              ))}
            </RechartsAreaChart>
          </ChartContainer>
        </div>
      )
    },

    BarChart: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.yKeys ?? []
      const isHorizontal = props.horizontal ?? false
      const singleSeries = keys.length === 1

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }
      if (keys.length === 0) {
        return <FallbackMessage>Unable to plot: no series specified (yKeys empty).</FallbackMessage>
      }
      const missing = missingKeys(items, keys)
      if (missing.length === keys.length || !rowHas(items, props.xKey)) {
        return (
          <FallbackMessage>
            Unable to plot: series fields ({[props.xKey, ...missing].filter(Boolean).join(', ')}) not found in data.
          </FallbackMessage>
        )
      }

      const config = singleSeries
        ? (() => {
            const c: ChartConfig = {}
            items.forEach((item, i) => {
              const label = String(item[props.xKey] ?? `Item ${i + 1}`)
              c[cssKey(label)] = { label, color: COLORS[i % COLORS.length] }
            })
            return c
          })()
        : buildChartConfig(keys)

      return (
        <div className={chartWrapperClass(fill)}>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} {...chartContainerProps(fill, props.height)}>
            <RechartsBarChart
              data={items}
              layout={isHorizontal ? 'vertical' : 'horizontal'}
              accessibilityLayer
              isAnimationActive={false}
            >
              <CartesianGrid vertical={false} />
              {isHorizontal ? (
                <>
                  <YAxis
                    dataKey={props.xKey}
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <XAxis type="number" hide />
                </>
              ) : (
                <XAxis
                  dataKey={props.xKey}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
              )}
              <ChartTooltip
                content={<ChartTooltipContent />}
                isAnimationActive={false}
              />
              {keys.length > 1 && (
                <ChartLegend content={<ChartLegendContent />} />
              )}
              {keys.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={singleSeries ? undefined : `var(--color-${cssKey(key)})`}
                  radius={4}
                  stackId={props.stacked ? 'a' : undefined}
                  isAnimationActive={false}
                >
                  {singleSeries &&
                    items.map((item, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                </Bar>
              ))}
            </RechartsBarChart>
          </ChartContainer>
        </div>
      )
    },

    LineChart: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.yKeys ?? []
      const config = buildChartConfig(keys)
      const curve = props.curveType ?? 'monotone'

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }
      if (keys.length === 0) {
        return <FallbackMessage>Unable to plot: no series specified (yKeys empty).</FallbackMessage>
      }
      const missing = missingKeys(items, keys)
      if (missing.length === keys.length || !rowHas(items, props.xKey)) {
        return (
          <FallbackMessage>
            Unable to plot: series fields ({[props.xKey, ...missing].filter(Boolean).join(', ')}) not found in data.
          </FallbackMessage>
        )
      }

      return (
        <div className={chartWrapperClass(fill)}>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} {...chartContainerProps(fill, props.height)}>
            <RechartsLineChart data={items} accessibilityLayer isAnimationActive={false}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey={props.xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                isAnimationActive={false}
              />
              {keys.length > 1 && (
                <ChartLegend content={<ChartLegendContent />} />
              )}
              {keys.map((key) => (
                <Line
                  key={key}
                  dataKey={key}
                  type={curve}
                  stroke={`var(--color-${cssKey(key)})`}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </RechartsLineChart>
          </ChartContainer>
        </div>
      )
    },

    PieChart: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const isDonut = props.donut ?? false

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }
      if (!rowHas(items, props.nameKey) || !rowHas(items, props.valueKey)) {
        return (
          <FallbackMessage>
            Unable to plot: fields ({props.nameKey}, {props.valueKey}) not found in data.
          </FallbackMessage>
        )
      }

      const config: ChartConfig = {}
      const pieData = items.map((item, i) => {
        const name = String(item[props.nameKey] ?? `Segment ${i + 1}`)
        const value =
          typeof item[props.valueKey] === 'number'
            ? item[props.valueKey]
            : parseFloat(String(item[props.valueKey])) || 0
        const fill = COLORS[i % COLORS.length]
        config[cssKey(name)] = { label: name, color: fill }
        return { name: cssKey(name), label: name, value, fill }
      })

      return (
        <div className={chartWrapperClass(fill)}>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} {...chartContainerProps(fill, props.height)}>
            <RechartsPieChart accessibilityLayer isAnimationActive={false}>
              <ChartTooltip
                content={<ChartTooltipContent nameKey="name" />}
                isAnimationActive={false}
              />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={isDonut ? '40%' : undefined}
                outerRadius="70%"
                paddingAngle={2}
                isAnimationActive={false}
              />
            </RechartsPieChart>
          </ChartContainer>
        </div>
      )
    },

    RadarChart: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.dataKeys ?? []
      const config = buildChartConfig(keys)

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }
      if (keys.length === 0) {
        return <FallbackMessage>Unable to plot: no series specified (dataKeys empty).</FallbackMessage>
      }
      const missing = missingKeys(items, keys)
      if (missing.length === keys.length || !rowHas(items, props.axisKey)) {
        return (
          <FallbackMessage>
            Unable to plot: fields ({[props.axisKey, ...missing].filter(Boolean).join(', ')}) not found in data.
          </FallbackMessage>
        )
      }

      return (
        <div className={chartWrapperClass(fill)}>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} {...chartContainerProps(fill, props.height)}>
            <RechartsRadarChart data={items} accessibilityLayer isAnimationActive={false}>
              <PolarGrid />
              <PolarAngleAxis dataKey={props.axisKey} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                isAnimationActive={false}
              />
              {keys.length > 1 && (
                <ChartLegend content={<ChartLegendContent />} />
              )}
              {keys.map((key) => (
                <Radar
                  key={key}
                  dataKey={key}
                  fill={`var(--color-${cssKey(key)})`}
                  fillOpacity={0.3}
                  stroke={`var(--color-${cssKey(key)})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </RechartsRadarChart>
          </ChartContainer>
        </div>
      )
    },

    RadialChart: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }
      if (!rowHas(items, props.nameKey) || !rowHas(items, props.valueKey)) {
        return (
          <FallbackMessage>
            Unable to plot: fields ({props.nameKey}, {props.valueKey}) not found in data.
          </FallbackMessage>
        )
      }

      const config: ChartConfig = {}
      const barData = items.map((item, i) => {
        const name = String(item[props.nameKey] ?? `Segment ${i + 1}`)
        const value =
          typeof item[props.valueKey] === 'number'
            ? item[props.valueKey]
            : parseFloat(String(item[props.valueKey])) || 0
        const fill = COLORS[i % COLORS.length]
        config[cssKey(name)] = { label: name, color: fill }
        return { name: cssKey(name), label: name, value, fill }
      })

      return (
        <div className={chartWrapperClass(fill)}>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} {...chartContainerProps(fill, props.height)}>
            <RechartsRadialBarChart
              data={barData}
              startAngle={180}
              endAngle={0}
              innerRadius="30%"
              outerRadius="100%"
              accessibilityLayer
              isAnimationActive={false}
            >
              <ChartTooltip
                content={<ChartTooltipContent nameKey="name" />}
                isAnimationActive={false}
              />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              <RadialBar dataKey="value" background isAnimationActive={false} />
            </RechartsRadialBarChart>
          </ChartContainer>
        </div>
      )
    },

    DataGrid: ({ props }) => {
      const fill = useFillMode()
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []

      if (items.length === 0) {
        return <FallbackMessage>No data available</FallbackMessage>
      }

      return (
        <DataGridInner
          items={items}
          columns={props.columns}
          title={props.title}
          height={props.height}
          pagination={props.pagination}
          pageSize={props.pageSize}
          fill={fill}
        />
      )
    },
  },
})
