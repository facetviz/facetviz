/**
 * FacetViz — public entry point.
 *
 * @example
 * import { FacetViz } from 'facetviz';
 * const chart = new FacetViz('#container', {
 *   chart: { type: 'column' },
 *   title: { text: 'Fruit consumption' },
 *   xAxis: { categories: ['Apples', 'Pears', 'Bananas'] },
 *   yAxis: { title: { text: 'Units' } },
 *   series: [{ name: 'Jane', data: [1, 5, 3] }, { name: 'John', data: [4, 2, 6] }],
 * });
 */

export { FacetViz } from "./core/chart.js";
export { FacetViz as Chart } from "./core/chart.js";

// Types (public API surface).
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
  MarkerOptions,
  DataLabelOptions,
  LabelContext,
  PlotLineOptions,
  PlotBandOptions,
  HoverStateOptions,
  SeriesTooltipOptions,
  ChartEvents,
  SeriesEvents,
  FacetVizPointEvent,
} from "./core/options.js";

// Theming.
export { resolveTheme, registerTheme, LIGHT_THEME } from "./core/theme.js";
export type { Theme, ThemeInput } from "./core/theme.js";

// Legend — read chart.legendItems / chart.hasLegend rather than inferring
// legend visibility from series.length (pie/donut/radialbar are always one
// series internally, with one legend entry per slice).
export type { LegendItem } from "./core/legend.js";

// Per-type option shapes — colocated with the series that owns them; the
// public `PointOptions`/`SeriesOptions` above already include these fields,
// this is for consumers who want the narrower per-type shape directly.
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
export type { PieSeriesOptions } from "./series/pie.js";
export type { BubbleSeriesOptions } from "./series/bubble.js";
export type {
  ScatterSeriesOptions,
  ScatterPointOptions,
} from "./series/scatter.js";
export type {
  SparklineOptions,
  SparklineSeriesOptions,
} from "./series/sparkline.js";

// Extensibility.
export { registerSeriesType, createSeries } from "./series/registry.js";
export { BaseSeries } from "./series/base.js";
export type { SeriesRenderContext, SeriesCapabilities } from "./series/base.js";

// Scales & helpers usable by custom series.
export { LinearScale, LogScale, CategoryScale } from "./core/scale.js";
export type { Scale } from "./core/scale.js";
export { Renderer } from "./core/renderer.js";
export { computeBoxStats } from "./series/boxplot.js";
export { DEFAULT_COLORS } from "./core/colors.js";

// Text formatting helpers (usable standalone).
export {
  formatString,
  formatValue,
  formatNumber,
  formatDate,
  abbreviateNumber,
  groupThousands,
} from "./core/utils.js";
