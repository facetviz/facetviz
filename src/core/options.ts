/**
 * Public configuration types for FacetViz.
 *
 * The shape follows familiar declarative charting conventions so that users of similar
 * libraries can migrate with minimal changes:
 *
 *   new FacetViz(container, {
 *     chart: { type: 'column' },
 *     title: { text: 'My chart' },
 *     xAxis: { categories: [...] },
 *     yAxis: { title: { text: 'Values' } },
 *     series: [{ name: 'Series 1', data: [1, 2, 3] }]
 *   });
 *
 * Every field is optional unless a chart genuinely cannot render without it;
 * sensible defaults live in `defaults.ts`.
 */

import type { ThemeInput } from "./theme.js";
// Per-type option fields are colocated with the series that owns them and
// composed back into the public `PointOptions`/`SeriesOptions` here — mirrors
// how a Highcharts-style library keeps each chart type's shape in its own
// module instead of one shared grab-bag interface. This import is type-only
// (erased at build) so it doesn't create a real runtime dependency from core
// on series/, even though the two files reference each other's types.
import type {
  BoxplotPointOptions,
  BoxplotSeriesOptions,
} from "../series/boxplot.js";
import type {
  DumbbellPointOptions,
  DumbbellSeriesOptions,
} from "../series/dumbbell.js";
import type { CandlestickPointOptions } from "../series/candlestick.js";
import type { BulletPointOptions } from "../series/bullet.js";
import type { WaterfallPointOptions } from "../series/waterfall.js";
import type { SankeyPointOptions } from "../series/sankey.js";
import type { GanttPointOptions } from "../series/gantt.js";
import type { CalendarPointOptions } from "../series/calendar.js";
import type { GaugeSeriesOptions } from "../series/gauge.js";
import type { HistogramSeriesOptions } from "../series/histogram.js";
import type { PieSeriesOptions } from "../series/pie.js";
import type { BubbleSeriesOptions } from "../series/bubble.js";
import type { ColumnOptions } from "../series/column.js";
import type {
  ScatterPointOptions,
  ScatterSeriesOptions,
} from "../series/scatter.js";
import type { SparklineSeriesOptions } from "../series/sparkline.js";

/** Every built-in series/chart type. */
export type ChartType =
  | "bar" // horizontal bars
  | "column" // vertical bars
  | "arearange" // filled band between a low and high value
  | "areasplinerange" // smoothed range band
  | "line"
  | "spline" // smoothed line
  | "step" // step line
  | "area"
  | "areaspline"
  | "pie"
  | "donut" // pie with an inner radius
  | "scatter"
  | "jitter" // scatter with categorical x + random spread
  | "boxplot"
  | "dumbbell" // two connected points per category (low → high)
  | "lollipop" // zero-anchored stem + marker per category, a lighter column
  | "slope" // one line per series across x-categories (before/after comparison)
  | "butterfly" // two series mirrored back-to-back around a central axis
  | "columnrange" // rounded-capsule range bar (vertical; horizontal when inverted)
  | "radialbar" // bars drawn around a polar centre
  | "heatmap" // coloured grid of category × category cells
  | "bullet" // measure bar with qualitative bands and a target marker
  | "candlestick" // OHLC financial candles
  | "gauge" // radial dial for a single value
  | "waterfall" // running cumulative increases / decreases
  | "histogram" // binned distribution of raw values
  | "timeline" // events placed along a line
  | "funnel" // narrowing stacked stages
  | "treegraph" // hierarchical node-link tree
  | "bubble" // scatter with a third value (z) driving marker size
  | "radar" // line/area over categories arranged around a polar centre
  | "sunburst" // multi-level radial hierarchy
  | "sankey" // weighted flows between nodes
  | "calendar" // day-grid heatmap by date
  | "gantt" // duration bars per row
  | "marimekko" // variable-width 100% stacked columns
  | "errorbar" // low/high whiskers, usually overlaid
  | "sparkline"; // tiny axis-less trend line, one per table cell/row

export type StackingMode = "normal" | "percent";

/** A single datum. Many shapes are accepted for author convenience. */
export type PointInput =
  | number // y only; x taken from index or categories
  | [number | string, number] // [x, y]
  | [number | string, number, number] // [x, low, high] for range/boxplot lows
  | PointOptions
  | null;

export interface PointOptions
  extends
    BoxplotPointOptions,
    DumbbellPointOptions,
    CandlestickPointOptions,
    BulletPointOptions,
    WaterfallPointOptions,
    SankeyPointOptions,
    GanttPointOptions,
    CalendarPointOptions,
    ScatterPointOptions,
    ColumnOptions {
  x?: number | string;
  y?: number;
  /** Range / dumbbell charts (arearange, areasplinerange, dumbbell, columnrange,
   *  errorbar) — shared verbatim across all of them, so it stays here rather
   *  than colocated with any single one. */
  low?: number;
  high?: number;
  /** Pie / categorical slices. */
  name?: string;
  /** Third value: variable-radius pie slice weight, or bubble marker size —
   *  shared between the two, so it stays here. */
  z?: number;
  /** Heatmap / sunburst cell or node measure — shared between the two. */
  value?: number;
  /** Treegraph / sunburst node identity / parent link — shared between the two. */
  id?: string;
  parent?: string;
  /** Drill-down: id of a `drilldown.series` entry to expand into on click. */
  drilldown?: string;
  /** Per-point colour override. */
  color?: string;
  /** Freeform payload surfaced back to the user in tooltips and events. */
  [key: string]: unknown;
}

export interface SeriesOptions
  extends
    BoxplotSeriesOptions,
    DumbbellSeriesOptions,
    GaugeSeriesOptions,
    HistogramSeriesOptions,
    PieSeriesOptions,
    BubbleSeriesOptions,
    ScatterSeriesOptions,
    SparklineSeriesOptions,
    ColumnOptions {
  type?: ChartType;
  name?: string;
  data: PointInput[];
  color?: string;
  /** Group id used for stacking / grouping. Series sharing a stack pile up. */
  stack?: string | number;
  stacking?: StackingMode;
  /** Which axis (by index) this series binds to. Enables combo charts. */
  xAxis?: number;
  yAxis?: number;
  visible?: boolean;
  /** Whether this series contributes an item to the chart legend. */
  showInLegend?: boolean;
  lineWidth?: number;
  /**
   * Generic shape-size override, interpreted per series type: rect
   * width/height for bar/column-family series (`columnWidth` wins if also
   * set), stroke width for line-family series -- line/spline/step/area/
   * slope/lollipop (`lineWidth` wins if also set) -- or marker radius for
   * scatter/jitter series (`radius` wins if also set). Lets a caller reach
   * for one property without knowing which specific option name a given
   * chart type uses.
   */
  size?: number;
  /** Marker configuration for point-based series. */
  marker?: MarkerOptions;
  dataLabels?: DataLabelOptions;
  /** Radar/area fill opacity (0 = line only). */
  fillOpacity?: number;
  /** Interaction states (hover scaling / highlight). */
  states?: { hover?: HoverStateOptions };
  /** Per-series tooltip formatter override. */
  tooltip?: SeriesTooltipOptions;
  /** Arbitrary user data. */
  [key: string]: unknown;
}

export interface MarkerOptions {
  enabled?: boolean;
  radius?: number;
  symbol?: "circle" | "square" | "diamond" | "triangle" | "rectangle";
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
  height?: number; // for rectangle symbol only
  width?: number; // for rectangle symbol only
}

export interface DataLabelOptions {
  enabled?: boolean;
  format?: string; // e.g. '{y}' or '{point.name}: {y}'
  formatter?: (ctx: LabelContext) => string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  /**
   * Where the label sits relative to its point/bar/slice:
   *  - bar & column: `outside` (default, beyond the bar end), `inside` (just
   *    within the end), `center`, or `base` (at the zero baseline).
   *  - line / area / scatter: `top` (default), `bottom`, `center`, `left`, `right`.
   *  - pie / donut: `outside` (default) or `inside`.
   */
  position?:
    | "outside"
    | "inside"
    | "center"
    | "base"
    | "top"
    | "bottom"
    | "left"
    | "right";
  /** Extra pixel offset applied in the label's natural direction. */
  distance?: number;
  /** Rotate the label text (degrees). */
  rotation?: number;
  backgroundColor?: string;
}

export interface LabelContext {
  x: number | string;
  y: number | undefined;
  point: PointOptions;
  series: string;
  /** Point name (falls back to x). */
  name?: string | number;
  /** 0-based index of the point within its series. */
  index?: number;
  /** Resolved point/series colour. */
  color?: string;
  /** Range series low/high. */
  low?: number;
  high?: number;
  /** This point's value as a share of the series total (0–100). */
  percentage?: number;
  /** Sum of the series' values. */
  total?: number;
}

export interface TitleOptions {
  text?: string;
  align?: "left" | "center" | "right";
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
}

export interface AxisOptions {
  /** Render the axis at all. When false, no line/ticks/labels/grid are drawn
   *  and no space is reserved for it. */
  visible?: boolean;
  /** Place the axis on the opposite side: y-axis → right, x-axis → top. */
  opposite?: boolean;
  /** Category labels for a categorical axis. */
  categories?: string[];
  type?: "linear" | "log" | "category" | "datetime";
  /** Draw a vertical/horizontal guide line at the hovered position. */
  crosshair?: boolean;
  title?: { text?: string; style?: Record<string, string> };
  min?: number;
  max?: number;
  /** Approximate number of ticks (linear axes). */
  tickCount?: number;
  labels?: {
    enabled?: boolean;
    format?: string; // '{value}'
    formatter?: (value: number | string) => string;
    rotation?: number;
    style?: Record<string, string>;
  };
  gridLineWidth?: number;
  gridLineColor?: string;
  lineColor?: string;
  lineWidth?: number;
  /** Draw the small tick marks between the axis line and its labels. Default true. */
  ticks?: boolean;
  /** Reference lines drawn across the plot at fixed axis values. */
  plotLines?: PlotLineOptions[];
  /** Shaded reference bands spanning an axis value interval. */
  plotBands?: PlotBandOptions[];
  /** Reverse the axis direction. */
  reversed?: boolean;
  /** Set on a value axis to start at zero regardless of data. */
  startOnZero?: boolean;
  /**
   * Dimension splitting: bind this axis to a data dimension so the chart
   * is broken into a grid of panels (small multiples). See `trellis`.
   */
  dimension?: string;
  /**
   * Nested axis: two or more dimension field names to arrange as
   * a hierarchy along this axis. The measure (`y`) is aggregated (summed) for
   * each leaf combination and the axis renders grouped headers with dividers —
   * the look produced when several dimensions are placed on one axis.
   */
  dimensions?: string[];
  /** Aggregation used when collapsing points into nested-axis leaves. */
  aggregate?: "sum" | "avg" | "count" | "min" | "max";
}

export interface PlotLineOptions {
  /** Axis value the line is drawn at. */
  value: number | string;
  color?: string;
  width?: number;
  /** Dash pattern, e.g. '4 3'. */
  dashStyle?: string;
  /** Stacking order relative to the series (default drawn above grid, below series). */
  zIndex?: "above" | "below";
  label?: {
    text: string;
    /**
     * Horizontal position along the line. For a y-axis (horizontal) line
     * this is where along its length the label sits; for an x-axis
     * (vertical) line it's which side of the line the label sits on
     * (`'center'` places it directly on the line). Defaults to an
     * automatic side pick that avoids running off the plot edge.
     */
    align?: "left" | "center" | "right";
    /**
     * Vertical position relative to the line. `'above'`/`'below'` hug the
     * line itself for a y-axis (horizontal) line; for an x-axis (vertical)
     * line — which has no "above/below the line" — this instead places the
     * label near the top or bottom of the plot. Defaults to `'above'`.
     */
    verticalAlign?: "above" | "below";
    color?: string;
  };
}

export interface PlotBandOptions {
  /** Band start value (inclusive). */
  from: number | string;
  /** Band end value. */
  to: number | string;
  color?: string;
  label?: { text: string; align?: "left" | "center" | "right"; color?: string };
}

export interface HoverStateOptions {
  enabled?: boolean;
  /** Scale multiplier applied to a point on hover, e.g. 1.06. */
  scale?: number;
  /** Brighten the point colour on hover by this ratio (0..1). */
  brightness?: number;
}

export interface TooltipOptions {
  enabled?: boolean;
  /** Token string, e.g. '<b>{series}</b><br/>{x}: {y}'. */
  format?: string;
  formatter?: (ctx: TooltipContext) => string;
  shared?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  /** Tooltip text colour. */
  color?: string;
  valueSuffix?: string;
  valuePrefix?: string;
  valueDecimals?: number;
}

export type SeriesTooltipOptions = Pick<
  TooltipOptions,
  "enabled" | "format" | "formatter" | "valueSuffix" | "valuePrefix" | "valueDecimals"
>;

export interface TooltipContext {
  series: string;
  x: number | string;
  y: number | undefined;
  point: PointOptions;
  color: string;
  /** Point name (falls back to x). */
  name?: string | number;
  /** 0-based index of the point within its series. */
  index?: number;
  /** This point's value as a share of the series total (0–100). */
  percentage?: number;
  /** Sum of the series' values. */
  total?: number;
  /** Range series low/high. */
  low?: number;
  high?: number;
  /** Boxplot five-number summary. */
  box?: {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outliers?: number[];
  };
  /** All points sharing this x, when `shared` is enabled. */
  points?: TooltipContext[];
}

export interface LegendOptions {
  enabled?: boolean;
  /** Horizontal alignment (top/bottom legends) or which side (vertical legends). */
  align?: "left" | "center" | "right";
  /** Vertical placement for a horizontal legend. */
  verticalAlign?: "top" | "bottom";
  /**
   * Item flow. `horizontal` (default) → a strip at top/bottom; `vertical` →
   * a stacked column placed on the left or right (per `align`).
   */
  layout?: "horizontal" | "vertical";
  itemStyle?: Record<string, string>;
}

export interface PlotOptions {
  /** Defaults applied to every series. */
  series?: Partial<SeriesOptions>;
  /** Per-type defaults, e.g. { column: { stacking: 'normal' } }. */
  [type: string]: Partial<SeriesOptions> | undefined;
}

/** Small-multiples configuration. */
export interface TrellisOptions {
  /** Dimension used to split panels horizontally (columns of the grid). */
  columns?: string;
  /** Dimension used to split panels vertically (rows of the grid). */
  rows?: string;
  /** Gap in px between panels. */
  gap?: number;
  /** Share the y scale across all panels (default true). */
  sharedY?: boolean;
  /** Share the x scale across all panels (default true). */
  sharedX?: boolean;
  /**
   * Render as a cross-tab table: a single shared y-axis on the left and
   * x-axis along the bottom, with row/column dimension names shown once as
   * headers rather than repeating a full axis in every cell. Default true.
   */
  table?: boolean;
}

/** Chart-wide events. Individual point events are wired through series. */
export interface ChartEvents {
  load?: (chart: unknown) => void;
  render?: (chart: unknown) => void;
  click?: (ev: FacetVizPointEvent) => void;
}

export interface SeriesEvents {
  click?: (ev: FacetVizPointEvent) => void;
  mouseOver?: (ev: FacetVizPointEvent) => void;
  mouseOut?: (ev: FacetVizPointEvent) => void;
  legendItemClick?: (ev: { series: string; visible: boolean }) => void;
}

export interface FacetVizPointEvent {
  type: string;
  seriesName: string;
  seriesIndex: number;
  pointIndex: number;
  x: number | string;
  y: number | undefined;
  point: PointOptions;
  /** Original DOM event, when available. */
  domEvent?: Event;
}

/** Enter animation on first render (and on data updates). */
export interface AnimationOptions {
  enabled?: boolean;
  /** Duration in ms (default 600). */
  duration?: number;
  /** CSS easing (default 'cubic-bezier(0.22, 1, 0.36, 1)'). */
  easing?: string;
}

/** Drag-to-zoom / pan configuration. */
export interface ZoomOptions {
  /** Axis to zoom by drag-select. `false` disables. */
  type?: "x" | "y" | "xy" | false;
}

/** High-volume canvas "boost" rendering. */
export interface BoostOptions {
  enabled?: boolean;
  /** Auto-enable boost once a boostable series exceeds this many points (default 1500). */
  threshold?: number;
}

/** Controls bounded streaming appends. The limit applies to raw source data. */
export interface AppendDataOptions {
  /** Retain only the newest N source points after appending. */
  maxPoints?: number;
}

export interface AccessibilityPointContext {
  seriesName: string;
  seriesIndex: number;
  pointIndex: number;
  x: number | string;
  y?: number;
  low?: number;
  high?: number;
  point: PointOptions;
}

/** Accessibility hints applied to the chart and its rendered data points. */
export interface AccessibilityOptions {
  enabled?: boolean;
  /** Overrides the auto description (defaults to the chart title). */
  description?: string;
  /**
   * Enable roving keyboard navigation across rendered SVG data points.
   * Arrow keys move between points; Home/End jump to the first/last point;
   * Enter/Space activate the same click path as a pointer. Default `true`.
   */
  keyboardNavigation?: boolean;
  /** Override the screen-reader label generated for each rendered point. */
  pointDescriptionFormatter?: (ctx: AccessibilityPointContext) => string;
}

export type ChartValidationSeverity = "error" | "warning";

export interface ChartValidationIssue {
  /** Stable machine-readable identifier, e.g. `series.data.required`. */
  code: string;
  severity: ChartValidationSeverity;
  /** Dot/bracket path into the supplied configuration. */
  path: string;
  message: string;
  suggestion?: string;
}

export interface ChartValidationResult {
  valid: boolean;
  errors: ChartValidationIssue[];
  warnings: ChartValidationIssue[];
  issues: ChartValidationIssue[];
}

export interface ChartValidationOptions {
  /** `warn` logs issues, `error` throws on errors, `silent` only calls `onIssue`. */
  mode?: "warn" | "error" | "silent";
  onIssue?: (issue: ChartValidationIssue) => void;
}

/** A drill-down series shown when a point with a matching `drilldown` id is clicked. */
export interface DrilldownSeries extends SeriesOptions {
  id: string;
}
export interface DrilldownOptions {
  series: DrilldownSeries[];
}

export interface ChartOptions {
  chart?: {
    type?: ChartType;
    width?: number;
    height?: number;
    backgroundColor?: string;
    spacing?: [number, number, number, number]; // top right bottom left
    inverted?: boolean;
    polar?: boolean;
    events?: ChartEvents;
    /** Colours cycled through by series without an explicit colour. */
    colors?: string[];
    /** Enter animation (default enabled). Pass `false` to disable. */
    animation?: boolean | AnimationOptions;
    /** Drag-to-zoom. Pass `'x'` / `'xy'` or a {@link ZoomOptions} object. */
    zoom?: "x" | "y" | "xy" | false | ZoomOptions;
    /** Auto re-render when the container resizes (default true). */
    reflow?: boolean;
    /**
     * Drop the axis lines themselves once the container gets too small,
     * leaving just gridlines and the series geometry, rather than rendering
     * an unreadably cramped chart. Default `true`; pass `false` to always
     * render every element regardless of size.
     */
    responsive?: boolean;
    /**
     * High-volume "boost" rendering. Cartesian point/line series with more than
     * `threshold` points are drawn to a single canvas overlay instead of one SVG
     * node per point, and lines are min/max-decimated to the pixel resolution.
     * `true` forces it on; `false` disables it; the default auto-enables it past
     * the threshold. See {@link BoostOptions}.
     */
    boost?: boolean | BoostOptions;
  };
  title?: TitleOptions;
  subtitle?: TitleOptions;
  xAxis?: AxisOptions | AxisOptions[];
  yAxis?: AxisOptions | AxisOptions[];
  tooltip?: TooltipOptions;
  legend?: LegendOptions;
  plotOptions?: PlotOptions;
  series: SeriesOptions[];
  colors?: string[];
  trellis?: TrellisOptions;
  /** Drill-down series revealed by clicking points that reference them. */
  drilldown?: DrilldownOptions;
  /** Accessibility hints for the root SVG. */
  accessibility?: AccessibilityOptions;
  /** Opt-in runtime configuration diagnostics. `true` is shorthand for warn mode. */
  validation?: boolean | ChartValidationOptions;
  /**
   * Visual theme. A built-in name (`'light'` | `'dark'` | `'high-contrast'` |
   * `'pastel'`), or a custom object (optionally extending a built-in via `base`).
   * Explicit `colors` / `chart.backgroundColor` / axis colours still win.
   */
  theme?: ThemeInput;
  /** Wire series-level events without repeating on every series. */
  seriesEvents?: SeriesEvents;
}
