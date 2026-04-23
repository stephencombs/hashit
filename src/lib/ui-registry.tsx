import {
  Suspense,
  createContext,
  lazy,
  useContext,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { defineRegistry } from "@json-render/react";
import { uiCatalog } from "./ui-catalog";

const FillModeContext = createContext(false);
export const FillModeProvider = FillModeContext.Provider;
function useFillMode() {
  return useContext(FillModeContext);
}

function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground py-4 text-center text-sm">{children}</p>
  );
}

type DeferredRendererProps = {
  props: Record<string, unknown>;
  fill: boolean;
};

const LazyAreaChartRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.AreaChartRenderer,
  })),
);
const LazyBarChartRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.BarChartRenderer,
  })),
);
const LazyLineChartRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.LineChartRenderer,
  })),
);
const LazyPieChartRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.PieChartRenderer,
  })),
);
const LazyRadarChartRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.RadarChartRenderer,
  })),
);
const LazyRadialChartRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.RadialChartRenderer,
  })),
);
const LazyDataGridRenderer = lazy(() =>
  import("./ui-registry-heavy").then((module) => ({
    default: module.DataGridRenderer,
  })),
);

function renderDeferredVisualization(
  Component: LazyExoticComponent<(props: DeferredRendererProps) => ReactNode>,
  props: Record<string, unknown>,
  fill: boolean,
) {
  return (
    <Suspense
      fallback={<LoadingMessage>Loading visualization...</LoadingMessage>}
    >
      <Component props={props} fill={fill} />
    </Suspense>
  );
}

export const { registry: uiRegistry } = defineRegistry(uiCatalog, {
  components: {
    AreaChart: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyAreaChartRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },

    BarChart: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyBarChartRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },

    LineChart: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyLineChartRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },

    PieChart: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyPieChartRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },

    RadarChart: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyRadarChartRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },

    RadialChart: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyRadialChartRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },

    DataGrid: ({ props }) => {
      const fill = useFillMode();
      return renderDeferredVisualization(
        LazyDataGridRenderer as unknown as LazyExoticComponent<
          (props: DeferredRendererProps) => ReactNode
        >,
        props as Record<string, unknown>,
        fill,
      );
    },
  },
});
