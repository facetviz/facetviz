/** Public API shared by the full and renderer-free core entrypoints. */

export { FacetViz } from "./core/chart.js";
export { FacetViz as Chart } from "./core/chart.js";

export type {
  ChartOptions,
  SeriesOptions,
  AxisOptions,
  ChartType,
  PointOptions,
  PointInput,
  TooltipOptions,
  TooltipContext,
  LegendOptions,
  TitleOptions,
  PlotOptions,
  TrellisOptions,
  StackingMode,
  AppendDataOptions,
  MarkerOptions,
  DataLabelOptions,
  LabelContext,
  PlotLineOptions,
  PlotBandOptions,
  HoverStateOptions,
  SeriesTooltipOptions,
  AccessibilityOptions,
  AccessibilityPointContext,
  ChartValidationSeverity,
  ChartValidationIssue,
  ChartValidationResult,
  ChartValidationOptions,
  ChartEvents,
  SeriesEvents,
  FacetVizPointEvent,
} from "./core/options.js";

export { resolveTheme, registerTheme, LIGHT_THEME } from "./core/theme.js";
export type { Theme, ThemeInput } from "./core/theme.js";
export type { LegendItem } from "./core/legend.js";

export type {
  BoxplotPointOptions,
  BoxplotSeriesOptions,
  BoxColors,
} from "./series/boxplot.js";
export type {
  DumbbellSeriesOptions,
  DumbbellPointOptions,
} from "./series/dumbbell.js";
export type { CandlestickPointOptions } from "./series/candlestick.js";
export type { BulletPointOptions } from "./series/bullet.js";
export type { WaterfallPointOptions } from "./series/waterfall.js";
export type { SankeyPointOptions } from "./series/sankey.js";
export type { GanttPointOptions } from "./series/gantt.js";
export type { CalendarPointOptions } from "./series/calendar.js";
export type { GaugeSeriesOptions } from "./series/gauge.js";
export type { HistogramSeriesOptions } from "./series/histogram.js";
export type { PieSeriesOptions, PieCenterLabelOptions } from "./series/pie.js";
export type { BubbleSeriesOptions } from "./series/bubble.js";
export type {
  ScatterSeriesOptions,
  ScatterPointOptions,
} from "./series/scatter.js";
export type {
  SparklineOptions,
  SparklineSeriesOptions,
} from "./series/sparkline.js";

export {
  registerSeriesType,
  registerSeriesTypes,
  createSeries,
  isSeriesTypeRegistered,
} from "./series/registry.js";
export type { SeriesConstructor } from "./series/registry.js";
export { BaseSeries } from "./series/base.js";
export type { SeriesRenderContext, SeriesCapabilities } from "./series/base.js";

export { LinearScale, LogScale, CategoryScale } from "./core/scale.js";
export type { Scale } from "./core/scale.js";
export { Renderer } from "./core/renderer.js";
export { DEFAULT_COLORS } from "./core/colors.js";
export { validateChartOptions, ChartValidationError } from "./core/validation.js";

export {
  formatString,
  formatValue,
  formatNumber,
  formatDate,
  abbreviateNumber,
  groupThousands,
} from "./core/utils.js";
