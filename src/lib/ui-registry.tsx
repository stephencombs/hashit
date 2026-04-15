import { defineRegistry } from '@json-render/react'
import { AllCommunityModule, themeQuartz, colorSchemeDarkBlue } from 'ag-grid-community'
import { AgGridProvider, AgGridReact } from 'ag-grid-react'
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
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

function chartHeight(height: number | null | undefined): number {
  return Math.max(200, height ?? 250)
}

export const { registry: uiRegistry } = defineRegistry(uiCatalog, {
  components: {
    AreaChart: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.yKeys ?? []
      const config = buildChartConfig(keys)
      const h = chartHeight(props.height)
      const curve = props.curveType ?? 'monotone'

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
        )
      }

      return (
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} style={{ minHeight: h, width: '100%' }}>
            <RechartsAreaChart data={items} accessibilityLayer>
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
                />
              ))}
            </RechartsAreaChart>
          </ChartContainer>
        </div>
      )
    },

    BarChart: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.yKeys ?? []
      const config = buildChartConfig(keys)
      const h = chartHeight(props.height)
      const isHorizontal = props.horizontal ?? false

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
        )
      }

      return (
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} style={{ minHeight: h, width: '100%' }}>
            <RechartsBarChart
              data={items}
              layout={isHorizontal ? 'vertical' : 'horizontal'}
              accessibilityLayer
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
                  fill={`var(--color-${cssKey(key)})`}
                  radius={4}
                  stackId={props.stacked ? 'a' : undefined}
                />
              ))}
            </RechartsBarChart>
          </ChartContainer>
        </div>
      )
    },

    LineChart: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.yKeys ?? []
      const config = buildChartConfig(keys)
      const h = chartHeight(props.height)
      const curve = props.curveType ?? 'monotone'

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
        )
      }

      return (
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} style={{ minHeight: h, width: '100%' }}>
            <RechartsLineChart data={items} accessibilityLayer>
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
                />
              ))}
            </RechartsLineChart>
          </ChartContainer>
        </div>
      )
    },

    PieChart: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const h = chartHeight(props.height)
      const isDonut = props.donut ?? false

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
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
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} style={{ minHeight: h, width: '100%' }}>
            <RechartsPieChart accessibilityLayer>
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
              />
            </RechartsPieChart>
          </ChartContainer>
        </div>
      )
    },

    RadarChart: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const keys = props.dataKeys ?? []
      const config = buildChartConfig(keys)
      const h = chartHeight(props.height)

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
        )
      }

      return (
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} style={{ minHeight: h, width: '100%' }}>
            <RechartsRadarChart data={items} accessibilityLayer>
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
                />
              ))}
            </RechartsRadarChart>
          </ChartContainer>
        </div>
      )
    },

    RadialChart: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []
      const h = chartHeight(props.height)

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
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
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <ChartContainer config={config} style={{ minHeight: h, width: '100%' }}>
            <RechartsRadialBarChart
              data={barData}
              startAngle={180}
              endAngle={0}
              innerRadius="30%"
              outerRadius="100%"
              accessibilityLayer
            >
              <ChartTooltip
                content={<ChartTooltipContent nameKey="name" />}
                isAnimationActive={false}
              />
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              <RadialBar dataKey="value" background />
            </RechartsRadialBarChart>
          </ChartContainer>
        </div>
      )
    },

    DataGrid: ({ props }) => {
      const items: Array<Record<string, unknown>> = Array.isArray(props.data)
        ? props.data
        : []

      if (items.length === 0) {
        return (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No data available
          </p>
        )
      }

      const columnDefs = props.columns
        ? props.columns.map((col) => ({
            field: col.field,
            headerName: col.headerName ?? col.field,
            width: col.width ?? undefined,
            sortable: col.sortable ?? true,
            filter: col.filter ?? true,
          }))
        : Object.keys(items[0]).map((key) => ({
            field: key,
            headerName: key,
            sortable: true,
            filter: true,
          }))

      const h = props.height ?? (items.length <= 20 ? undefined : 400)
      const usePagination = props.pagination ?? items.length > 50

      const isDark = typeof document !== 'undefined'
        && document.documentElement.classList.contains('dark')
      const gridTheme = isDark
        ? themeQuartz.withPart(colorSchemeDarkBlue)
        : themeQuartz

      return (
        <div>
          {props.title && (
            <p className="mb-2 text-sm font-medium">{props.title}</p>
          )}
          <AgGridProvider modules={[AllCommunityModule]}>
            <div style={h ? { height: h } : undefined}>
              <AgGridReact
                theme={gridTheme}
                rowData={items}
                columnDefs={columnDefs}
                domLayout={h ? 'normal' : 'autoHeight'}
                pagination={usePagination}
                paginationPageSize={props.pageSize ?? 10}
                defaultColDef={{ resizable: true, flex: 1 }}
              />
            </div>
          </AgGridProvider>
        </div>
      )
    },
  },
})
