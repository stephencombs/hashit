import { memo, useEffect, useMemo, useState } from "react";
import {
  AllCommunityModule,
  colorSchemeDarkBlue,
  themeQuartz,
} from "ag-grid-community";
import type { GridReadyEvent } from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";
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
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/shared/ui/chart";

const AG_GRID_MODULES = [AllCommunityModule];
const AG_GRID_THEME_LIGHT = themeQuartz;
const AG_GRID_THEME_DARK = themeQuartz.withPart(colorSchemeDarkBlue);
const AG_GRID_DEFAULT_COL_DEF = { resizable: true };

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type RegistryComponentProps = {
  props: Record<string, unknown>;
  fill: boolean;
};

interface DataGridColumnSpec {
  field: string;
  headerName?: string | null;
  sortable?: boolean | null;
  filter?: boolean | null;
}

interface DataGridInnerProps {
  items: Array<Record<string, unknown>>;
  columns?: DataGridColumnSpec[] | null;
  title?: string | null;
  height?: number | null;
  pagination?: boolean | null;
  pageSize?: number | null;
  fill: boolean;
}

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function chartWrapperClass(fill: boolean): string | undefined {
  return fill ? "flex h-full w-full flex-col" : undefined;
}

function chartContainerProps(
  fill: boolean,
  height: number | null | undefined,
): { className?: string; style?: React.CSSProperties } {
  if (fill) {
    return { className: "aspect-auto w-full flex-1 min-h-[200px]" };
  }
  const minHeight = Math.max(200, height ?? 250);
  return { style: { minHeight, width: "100%" } };
}

function dataGridInnerProps(
  fill: boolean,
  height: number | null | undefined,
): { className?: string; style?: React.CSSProperties } {
  if (fill) return { className: "flex-1 min-h-[320px] w-full" };
  if (typeof height === "number") return { style: { height } };
  return { className: "w-full" };
}

function cssKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
}

function buildChartConfig(keys: string[]): ChartConfig {
  const config: ChartConfig = {};
  keys.forEach((key, i) => {
    config[cssKey(key)] = { label: key, color: COLORS[i % COLORS.length] };
  });
  return config;
}

function rowHas(items: Array<Record<string, unknown>>, key: string): boolean {
  if (!key) return false;
  return items.some(
    (row) => row != null && typeof row === "object" && key in row,
  );
}

function missingKeys(
  items: Array<Record<string, unknown>>,
  keys: string[],
): string[] {
  return keys.filter((k) => !rowHas(items, k));
}

function FallbackMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground py-4 text-center text-sm">{children}</p>
  );
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
      return columns
        .map(
          (c) =>
            `${c.field}|${c.headerName ?? ""}|${c.sortable ?? ""}|${c.filter ?? ""}`,
        )
        .join(",");
    }
    if (items[0]) return Object.keys(items[0]).join(",");
    return "";
  }, [columns, items]);

  const columnDefs = useMemo(() => {
    if (columns && columns.length > 0) {
      return columns.map((col) => ({
        field: col.field,
        headerName: col.headerName ?? col.field,
        sortable: col.sortable ?? true,
        filter: col.filter ?? true,
      }));
    }
    if (!items[0]) return [];
    return Object.keys(items[0]).map((key) => ({
      field: key,
      headerName: key,
      sortable: true,
      filter: true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnKeys]);

  const usePagination = pagination ?? items.length > 50;
  const isDark = useIsDarkMode();
  const gridTheme = isDark ? AG_GRID_THEME_DARK : AG_GRID_THEME_LIGHT;
  const domLayout =
    fill || typeof height === "number" ? "normal" : "autoHeight";

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
              params.api.autoSizeAllColumns();
              const cols = params.api.getColumns() ?? [];
              const columnLimits = cols.map((c) => ({
                key: c.getColId(),
                minWidth: c.getActualWidth(),
              }));
              params.api.sizeColumnsToFit({ columnLimits });
            }}
          />
        </div>
      </AgGridProvider>
    </div>
  );
});

export function AreaChartRenderer({ props, fill }: RegistryComponentProps) {
  const chartProps = props as {
    data?: Array<Record<string, unknown>>;
    yKeys?: string[];
    xKey?: string;
    title?: string | null;
    height?: number | null;
    curveType?: "monotone" | "linear" | "step" | "natural" | null;
    stacked?: boolean | null;
  };
  const items = Array.isArray(chartProps.data) ? chartProps.data : [];
  const keys = chartProps.yKeys ?? [];
  const config = buildChartConfig(keys);
  const curve = chartProps.curveType ?? "monotone";

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }
  if (keys.length === 0) {
    return (
      <FallbackMessage>
        Unable to plot: no series specified (yKeys empty).
      </FallbackMessage>
    );
  }
  const missing = missingKeys(items, keys);
  if (missing.length === keys.length || !rowHas(items, chartProps.xKey ?? "")) {
    return (
      <FallbackMessage>
        Unable to plot: series fields (
        {[chartProps.xKey, ...missing].filter(Boolean).join(", ")}) not found in
        data.
      </FallbackMessage>
    );
  }

  return (
    <div className={chartWrapperClass(fill)}>
      {chartProps.title && (
        <p className="mb-2 text-sm font-medium">{chartProps.title}</p>
      )}
      <ChartContainer
        config={config}
        {...chartContainerProps(fill, chartProps.height)}
      >
        <RechartsAreaChart
          data={items}
          accessibilityLayer
          isAnimationActive={false}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={chartProps.xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <ChartTooltip
            content={<ChartTooltipContent />}
            isAnimationActive={false}
          />
          {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
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
              stackId={chartProps.stacked ? "a" : undefined}
              isAnimationActive={false}
            />
          ))}
        </RechartsAreaChart>
      </ChartContainer>
    </div>
  );
}

export function BarChartRenderer({ props, fill }: RegistryComponentProps) {
  const chartProps = props as {
    data?: Array<Record<string, unknown>>;
    yKeys?: string[];
    xKey?: string;
    title?: string | null;
    height?: number | null;
    horizontal?: boolean | null;
    stacked?: boolean | null;
  };
  const items = Array.isArray(chartProps.data) ? chartProps.data : [];
  const keys = chartProps.yKeys ?? [];
  const isHorizontal = chartProps.horizontal ?? false;
  const singleSeries = keys.length === 1;

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }
  if (keys.length === 0) {
    return (
      <FallbackMessage>
        Unable to plot: no series specified (yKeys empty).
      </FallbackMessage>
    );
  }
  const missing = missingKeys(items, keys);
  if (missing.length === keys.length || !rowHas(items, chartProps.xKey ?? "")) {
    return (
      <FallbackMessage>
        Unable to plot: series fields (
        {[chartProps.xKey, ...missing].filter(Boolean).join(", ")}) not found in
        data.
      </FallbackMessage>
    );
  }

  const config = singleSeries
    ? (() => {
        const c: ChartConfig = {};
        items.forEach((item, i) => {
          const label = String(item[chartProps.xKey ?? ""] ?? `Item ${i + 1}`);
          c[cssKey(label)] = { label, color: COLORS[i % COLORS.length] };
        });
        return c;
      })()
    : buildChartConfig(keys);

  return (
    <div className={chartWrapperClass(fill)}>
      {chartProps.title && (
        <p className="mb-2 text-sm font-medium">{chartProps.title}</p>
      )}
      <ChartContainer
        config={config}
        {...chartContainerProps(fill, chartProps.height)}
      >
        <RechartsBarChart
          data={items}
          layout={isHorizontal ? "vertical" : "horizontal"}
          accessibilityLayer
          isAnimationActive={false}
        >
          <CartesianGrid vertical={false} />
          {isHorizontal ? (
            <>
              <YAxis
                dataKey={chartProps.xKey}
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <XAxis type="number" hide />
            </>
          ) : (
            <XAxis
              dataKey={chartProps.xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
          )}
          <ChartTooltip
            content={<ChartTooltipContent />}
            isAnimationActive={false}
          />
          {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {keys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={singleSeries ? undefined : `var(--color-${cssKey(key)})`}
              radius={4}
              stackId={chartProps.stacked ? "a" : undefined}
              isAnimationActive={false}
            >
              {singleSeries &&
                items.map((item, i) => (
                  <Cell
                    key={`${String(item[chartProps.xKey ?? ""] ?? i)}-${i}`}
                    fill={COLORS[i % COLORS.length]}
                  />
                ))}
            </Bar>
          ))}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

export function LineChartRenderer({ props, fill }: RegistryComponentProps) {
  const chartProps = props as {
    data?: Array<Record<string, unknown>>;
    yKeys?: string[];
    xKey?: string;
    title?: string | null;
    height?: number | null;
    curveType?: "monotone" | "linear" | "step" | "natural" | null;
  };
  const items = Array.isArray(chartProps.data) ? chartProps.data : [];
  const keys = chartProps.yKeys ?? [];
  const config = buildChartConfig(keys);
  const curve = chartProps.curveType ?? "monotone";

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }
  if (keys.length === 0) {
    return (
      <FallbackMessage>
        Unable to plot: no series specified (yKeys empty).
      </FallbackMessage>
    );
  }
  const missing = missingKeys(items, keys);
  if (missing.length === keys.length || !rowHas(items, chartProps.xKey ?? "")) {
    return (
      <FallbackMessage>
        Unable to plot: series fields (
        {[chartProps.xKey, ...missing].filter(Boolean).join(", ")}) not found in
        data.
      </FallbackMessage>
    );
  }

  return (
    <div className={chartWrapperClass(fill)}>
      {chartProps.title && (
        <p className="mb-2 text-sm font-medium">{chartProps.title}</p>
      )}
      <ChartContainer
        config={config}
        {...chartContainerProps(fill, chartProps.height)}
      >
        <RechartsLineChart
          data={items}
          accessibilityLayer
          isAnimationActive={false}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={chartProps.xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <ChartTooltip
            content={<ChartTooltipContent />}
            isAnimationActive={false}
          />
          {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
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
  );
}

export function PieChartRenderer({ props, fill }: RegistryComponentProps) {
  const chartProps = props as {
    data?: Array<Record<string, unknown>>;
    nameKey?: string;
    valueKey?: string;
    title?: string | null;
    height?: number | null;
    donut?: boolean | null;
  };
  const items = Array.isArray(chartProps.data) ? chartProps.data : [];
  const isDonut = chartProps.donut ?? false;

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }
  if (
    !rowHas(items, chartProps.nameKey ?? "") ||
    !rowHas(items, chartProps.valueKey ?? "")
  ) {
    return (
      <FallbackMessage>
        Unable to plot: fields ({chartProps.nameKey}, {chartProps.valueKey}) not
        found in data.
      </FallbackMessage>
    );
  }

  const config: ChartConfig = {};
  const pieData = items.map((item, i) => {
    const name = String(item[chartProps.nameKey ?? ""] ?? `Segment ${i + 1}`);
    const value =
      typeof item[chartProps.valueKey ?? ""] === "number"
        ? (item[chartProps.valueKey ?? ""] as number)
        : parseFloat(String(item[chartProps.valueKey ?? ""])) || 0;
    const fillColor = COLORS[i % COLORS.length];
    config[cssKey(name)] = { label: name, color: fillColor };
    return { name: cssKey(name), label: name, value, fill: fillColor };
  });

  return (
    <div className={chartWrapperClass(fill)}>
      {chartProps.title && (
        <p className="mb-2 text-sm font-medium">{chartProps.title}</p>
      )}
      <ChartContainer
        config={config}
        {...chartContainerProps(fill, chartProps.height)}
      >
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
            innerRadius={isDonut ? "40%" : undefined}
            outerRadius="70%"
            paddingAngle={2}
            isAnimationActive={false}
          />
        </RechartsPieChart>
      </ChartContainer>
    </div>
  );
}

export function RadarChartRenderer({ props, fill }: RegistryComponentProps) {
  const chartProps = props as {
    data?: Array<Record<string, unknown>>;
    dataKeys?: string[];
    axisKey?: string;
    title?: string | null;
    height?: number | null;
  };
  const items = Array.isArray(chartProps.data) ? chartProps.data : [];
  const keys = chartProps.dataKeys ?? [];
  const config = buildChartConfig(keys);

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }
  if (keys.length === 0) {
    return (
      <FallbackMessage>
        Unable to plot: no series specified (dataKeys empty).
      </FallbackMessage>
    );
  }
  const missing = missingKeys(items, keys);
  if (
    missing.length === keys.length ||
    !rowHas(items, chartProps.axisKey ?? "")
  ) {
    return (
      <FallbackMessage>
        Unable to plot: fields (
        {[chartProps.axisKey, ...missing].filter(Boolean).join(", ")}) not found
        in data.
      </FallbackMessage>
    );
  }

  return (
    <div className={chartWrapperClass(fill)}>
      {chartProps.title && (
        <p className="mb-2 text-sm font-medium">{chartProps.title}</p>
      )}
      <ChartContainer
        config={config}
        {...chartContainerProps(fill, chartProps.height)}
      >
        <RechartsRadarChart
          data={items}
          accessibilityLayer
          isAnimationActive={false}
        >
          <PolarGrid />
          <PolarAngleAxis dataKey={chartProps.axisKey} />
          <ChartTooltip
            content={<ChartTooltipContent />}
            isAnimationActive={false}
          />
          {keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
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
  );
}

export function RadialChartRenderer({ props, fill }: RegistryComponentProps) {
  const chartProps = props as {
    data?: Array<Record<string, unknown>>;
    nameKey?: string;
    valueKey?: string;
    title?: string | null;
    height?: number | null;
  };
  const items = Array.isArray(chartProps.data) ? chartProps.data : [];

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }
  if (
    !rowHas(items, chartProps.nameKey ?? "") ||
    !rowHas(items, chartProps.valueKey ?? "")
  ) {
    return (
      <FallbackMessage>
        Unable to plot: fields ({chartProps.nameKey}, {chartProps.valueKey}) not
        found in data.
      </FallbackMessage>
    );
  }

  const config: ChartConfig = {};
  const barData = items.map((item, i) => {
    const name = String(item[chartProps.nameKey ?? ""] ?? `Segment ${i + 1}`);
    const value =
      typeof item[chartProps.valueKey ?? ""] === "number"
        ? (item[chartProps.valueKey ?? ""] as number)
        : parseFloat(String(item[chartProps.valueKey ?? ""])) || 0;
    const fillColor = COLORS[i % COLORS.length];
    config[cssKey(name)] = { label: name, color: fillColor };
    return { name: cssKey(name), label: name, value, fill: fillColor };
  });

  return (
    <div className={chartWrapperClass(fill)}>
      {chartProps.title && (
        <p className="mb-2 text-sm font-medium">{chartProps.title}</p>
      )}
      <ChartContainer
        config={config}
        {...chartContainerProps(fill, chartProps.height)}
      >
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
  );
}

export function DataGridRenderer({ props, fill }: RegistryComponentProps) {
  const gridProps = props as {
    data?: Array<Record<string, unknown>>;
    columns?: DataGridColumnSpec[] | null;
    title?: string | null;
    height?: number | null;
    pagination?: boolean | null;
    pageSize?: number | null;
  };
  const items = Array.isArray(gridProps.data) ? gridProps.data : [];

  if (items.length === 0) {
    return <FallbackMessage>No data available</FallbackMessage>;
  }

  return (
    <DataGridInner
      items={items}
      columns={gridProps.columns}
      title={gridProps.title}
      height={gridProps.height}
      pagination={gridProps.pagination}
      pageSize={gridProps.pageSize}
      fill={fill}
    />
  );
}
