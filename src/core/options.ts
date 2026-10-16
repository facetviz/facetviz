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
import type { RadialBarSeriesOptions } from "../series/radialbar.js";
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
  | "gauge" // radial dial for one or more values
  | "waterfall" // running cumulative increases / decreases
  | "histogram" // binned distribution of raw values
  | "timeline" // events placed along a line
  | "funnel" // narrowing stacked stages
  | "treegraph" // hierarchical node-link tree
  | "bubble" // scatter with a third value (z) driving marker size
  | "radar" // line/area over categories arranged around a polar centre
  | "sunburst" // multi-level radial hierarchy
  | "treemap" // hierarchy as nested rectangles sized by value
  | "sankey" // weighted flows between nodes
  | "calendar" // day-grid heatmap by date
  | "gantt" // duration bars per row
  | "marimekko" // variable-width 100% stacked columns
  | "errorbar" // low/high whiskers, usually overlaid
  | "tick" // column-width line at each value, not zero-anchored -- a dot plot
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
  /** Heatmap / sunburst / treemap cell or node measure — shared between them. */
  value?: number;
  /** Treegraph / sunburst / treemap node identity / parent link — shared between them. */
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
    RadialBarSeriesOptions,
    ColumnOptions {
  type?: ChartType;
  name?: string;
  data: PointInput[];
  color?: string;
  /**
   * Area/areaspline interior fill. A string uses a solid SVG paint; a linear
   * gradient uses object-bounding-box coordinates (0..1) by default.
   */
  fillColor?: AreaFillColor;
  /** Group id used for stacking / grouping. Series sharing a stack pile up. */
  stack?: string | number;
  stacking?: StackingMode;
  /** Which axis (by index) this series binds to. Enables combo charts. */
  xAxis?: 0 | 1;
  yAxis?: 0 | 1;
  visible?: boolean;
  /** Whether this series contributes an item to the chart legend. */
  showInLegend?: boolean;
  /**
   * A heading its legend item is listed under. Neighbouring series with the
   * same group share one heading; series without one stay as plain items.
   */
  legendGroup?: string;
  /**
   * Series with the same key share one legend item: the first one's, named
   * `legendLabel` when it has one. The item shows and hides them together.
   */
  legendKey?: string;
  /** The label of a `legendKey` item, in place of the series' name. */
  legendLabel?: string;
  lineWidth?: number;
  /** Line-family and area series: SVG dash pattern for the line, e.g. '6 4'
   * (dashed) or '1 4' (dotted). Unset draws a solid line. */
  dashStyle?: string;
  /** Line-family series: opacity (0..1) of the whole series -- line,
   * markers and data labels. Column/bar series: opacity of the bars' fill;
   * their data labels stay fully opaque. */
  opacity?: number;
  /**
   * Line series: draw each straight segment shading from its start point's
   * color to its end point's, so per-point colors carry along the line.
   */
  blendPointColors?: boolean;
  /**
   * Generic shape-size override, interpreted per series type: rect
   * width/height for bar/column-family series, or tick's line length
   * (`columnWidth` wins if also set), stroke width for line-family series --
   * line/spline/step/area/slope/lollipop (`lineWidth` wins if also set) -- or
   * marker radius for scatter/jitter series (`radius` wins if also set). Lets
   * a caller reach for one property without knowing which specific option
   * name a given chart type uses.
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

export type GradientCoordinate = number | `${number}%`;
export type GradientOffset = number | `${number}%`;

export interface LinearGradientColor {
  linearGradient: {
    x1?: GradientCoordinate;
    y1?: GradientCoordinate;
    x2?: GradientCoordinate;
    y2?: GradientCoordinate;
    gradientUnits?: "objectBoundingBox" | "userSpaceOnUse";
  };
  /** `[offset, color]`, with an optional SVG stop opacity. */
  stops: Array<
    | [offset: GradientOffset, color: string]
    | [offset: GradientOffset, color: string, opacity: number]
  >;
}

export type AreaFillColor = string | LinearGradientColor;

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
  /** Horizontal text alignment relative to the resolved label position. */
  align?: "left" | "center" | "right";
  /**
   * Where the label sits relative to its point/bar/slice:
   *  - bar & column: `outside` (default, beyond the bar end), `inside` (just
   *    within the end), `center`, or `base` (at the zero baseline).
   *  - line / area / scatter: `top` (default), `bottom`, `center`, `left`, `right`.
   *  - pie / donut: inside-first by default (falling back to `outside` when a
   *    label does not fit); `outside` forces every label beyond the sector.
   *    `inside` explicitly selects the adaptive inside-first behaviour.
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
  /**
   * Bar & column: where the label sits across the bar — for columns
   * `start` is the left edge and `end` the right; for bars `start` is the
   * top edge and `end` the bottom. Default `center`.
   */
  crossAlign?: "start" | "center" | "end";
  /** Extra pixel offset applied in the label's natural direction. */
  distance?: number;
  /** Pixels to move the label right (negative: left), after placing it. */
  offsetX?: number;
  /** Pixels to move the label down (negative: up), after placing it. */
  offsetY?: number;
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
  /** Render the title. Default `true` when text is present. */
  enabled?: boolean;
  align?: "left" | "center" | "right";
  /** Space below the title block in pixels. */
  margin?: number;
  /** Additional vertical offset applied to the rendered title. */
  offsetY?: number;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
}

export interface AxisTitleOptions {
  text?: string;
  /** Render the axis title. Default `true` when text is present. */
  enabled?: boolean;
  /** Position along the axis. */
  align?: "start" | "center" | "end";
  /** Gap between the tick labels and title in pixels. */
  margin?: number;
  /** Additional offset away from the plot in pixels. */
  offset?: number;
  /** Polar x-axis placement. Ignored by Cartesian axes. */
  position?: "outer" | "center";
  style?: Record<string, string>;
}

export interface AxisLabelOptions {
  enabled?: boolean;
  format?: string; // '{value}'
  formatter?: (value: number | string) => string;
  rotation?: number;
  /**
   * Candidate rotations used when horizontal category labels overlap.
   * The first rotation that fits is selected before labels are thinned.
   */
  autoRotation?: number[];
  /** Draw every Nth label. Automatic collision handling may choose a larger step. */
  step?: number;
  /** Maximum rendered width of one label in pixels. */
  maxWidth?: number;
  /** What to do when a label exceeds `maxWidth`. Default `'ellipsis'`. */
  overflow?: "ellipsis" | "hide";
  /**
   * Polar x-axis placement. `inner` curves category labels around the centre
   * hole; ignored by Cartesian axes.
   */
  position?: "outer" | "inner";
  /**
   * Gap from the axis line in pixels. On Cartesian axes, positive values move
   * labels farther away from the plot. On polar x-axes, positive values move
   * inner labels toward the centre, outer labels away from the plot, and
   * inverted radial labels beside the vertical radius.
   */
  offset?: number;
  style?: Record<string, string>;
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
  title?: AxisTitleOptions;
  min?: number;
  max?: number;
  /** Approximate number of ticks (linear axes). */
  /** Approximate number of ticks on a linear axis. Default `4`. */
  tickCount?: number;
  labels?: AxisLabelOptions;
  /** SVG dash array for major grid lines, for example `'6 3'`. */
  gridLineDashStyle?: string;
  gridLineWidth?: number;
  gridLineColor?: string;
  /**
   * Fill every other category band across the plot area. Only applies to
   * categorical axes; the intervening bands retain the chart background.
   */
  alternateGridColor?: string;
  /**
   * Spacing between minor grid lines on continuous axes. A positive number
   * uses data units; `'auto'` divides each major-tick interval into fifths.
   * Minor grid lines are disabled when this option is omitted.
   */
  minorTickInterval?: number | "auto";
  /** Minor grid line thickness. Default `1` when minor grid lines are enabled. */
  minorGridLineWidth?: number;
  /** Minor grid line colour. Defaults to `gridLineColor`. */
  minorGridLineColor?: string;
  /** SVG dash array for minor grid lines. Default `'2 2'`. */
  minorGridLineDashStyle?: string;
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
  /**
   * Nested axis: where the lines between its groups go. `'axis'` (default)
   * draws them only among the label tiers, as a plain category axis keeps
   * the plot clear; `'plot'` also carries them through the plot (the
   * classic nested-columns look); `'none'` draws none. The baseline stays
   * either way (`lineWidth: 0` hides it).
   */
  groupLines?: "axis" | "plot" | "none";
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
  /** Index of the series in `options.series`, and its options as given. */
  seriesIndex?: number;
  seriesOptions?: SeriesOptions;
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

/**
 * A gradient legend entry standing for a run of series, e.g. one series per
 * value of a numeric field drawn in shades of one colour.
 */
export interface LegendColorScale {
  /** Text before the bar. */
  label?: string;
  /** Labels at the low and high ends of the bar. */
  min: string;
  max: string;
  /** Colours from low to high, spaced evenly along the bar. */
  colors: string[];
  /** Indexes of the series the scale stands for; clicking it toggles them together. */
  series?: number[];
}

export interface LegendOptions {
  enabled?: boolean;
  /**
   * Gradient entries drawn before the series items. Hide the series they
   * stand for with `showInLegend: false`. A legend with a scale renders even
   * with a single entry.
   */
  colorScales?: LegendColorScale[];
  /** Horizontal alignment (top/bottom legends) or which side (vertical legends). */
  align?: "left" | "center" | "right";
  /** Vertical placement for a horizontal legend. */
  verticalAlign?: "top" | "bottom";
  /**
   * Item flow. `horizontal` (default) → a strip at top/bottom; `vertical` →
   * a stacked column placed on the left or right (per `align`).
   */
  layout?: "horizontal" | "vertical";
  /** Gap between the legend and adjacent chart content in pixels. */
  margin?: number;
  /** Padding around the legend items in pixels. */
  padding?: number;
  /** Horizontal translation applied after the legend is laid out. */
  offsetX?: number;
  /** Vertical translation applied after the legend is laid out. */
  offsetY?: number;
  /** Gap between the colour symbol and its label. Default `6`. */
  symbolPadding?: number;
  /** Gap after each item in a horizontal legend. Default `18`. */
  itemGap?: number;
  /** Gap between rows/items. Default `6`. */
  rowGap?: number;
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

export interface AnnotationOptions {
  /** X-axis value. Omit to anchor the annotation to the plot centre. */
  x?: number | string;
  /** Y-axis value. Omit to anchor the annotation to the plot centre. */
  y?: number;
  text?: string;
  /** Visual form. `callout` draws a connector from the data point to the label. */
  shape?: "label" | "callout" | "circle";
  /** Horizontal label offset from the data anchor. */
  dx?: number;
  /** Vertical label offset from the data anchor. */
  dy?: number;
  /** Radius for the anchor marker or circle annotation. */
  radius?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number;
  style?: Record<string, string>;
  /** Axis indices used to resolve the data position. */
  xAxis?: 0 | 1;
  yAxis?: 0 | 1;
  /** Draw below or above the series. Default `'above'`. */
  zIndex?: "below" | "above";
}

/** A text block positioned relative to the chart edges or centre. */
export interface ChartTextOptions {
  text: string;
  /** Render this text block. Default `true`. */
  enabled?: boolean;
  /** Horizontal chart anchor. Default `'left'`. */
  align?: "left" | "center" | "right";
  /** Vertical chart anchor. Default `'top'`. */
  verticalAlign?: "top" | "center" | "bottom";
  /** Additional horizontal displacement in pixels. */
  offsetX?: number;
  /** Additional vertical displacement in pixels. */
  offsetY?: number;
  color?: string;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  /** Distance between baselines for multiline text. Defaults to 1.2 × font size. */
  lineHeight?: number;
  /** Clockwise rotation in degrees around the text anchor. */
  rotation?: number;
  /** Additional class placed on this text block's SVG group. */
  className?: string;
}

export interface ResponsiveCondition {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export type ResponsiveChartOptions = Partial<
  Pick<
    ChartOptions,
    | "chart"
    | "title"
    | "subtitle"
    | "xAxis"
    | "yAxis"
    | "tooltip"
    | "legend"
    | "trellis"
    | "annotations"
    | "texts"
    | "accessibility"
  >
>;

export interface ResponsiveRule {
  condition: ResponsiveCondition;
  /** Options deep-merged for the duration of a matching render. */
  options: ResponsiveChartOptions;
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
    /**
     * Donut-style hole in a general polar chart. A number is pixels; a
     * percentage string is relative to the outer radius, e.g. `'35%'`.
     */
    polarInnerSize?: number | string;
    /** Fill of the polar centre hole. Defaults to the chart background. */
    polarInnerBackgroundColor?: string;
    /**
     * Angular grid dividers. `spoke` draws through category centres;
     * `sector` draws category boundaries so each wedge is outlined.
     */
    polarGridLineMode?: "spoke" | "sector";
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
     * Prioritize the plot on constrained charts by compacting default axis-title
     * and legend gaps, hiding data labels, and, at the smallest sizes, hiding
     * axis lines. Explicit margin options are never compacted. Default `true`;
     * pass `false` to preserve the full-size layout and every configured element.
     */
    responsive?: boolean;
    /**
     * Scale every chrome font size (title, subtitle, axis labels, legend,
     * data labels, positioned texts) in proportion to the chart's own pixel
     * size, the same way `chart.width`/`chart.height` scale the geometry --
     * a chart authored (and whose font sizes were tuned) at one size still
     * reads correctly at thumbnail or full-screen scale. Default `true`,
     * including for an explicit `style.fontSize` you set on any of those;
     * pass `false` to render every font size verbatim, in real pixels,
     * regardless of the chart's own size.
     */
    scaleFonts?: boolean;
    /**
     * Keep the plot area clear of edge-anchored `texts` by reserving each
     * one's measured size on the side it is anchored to, instead of letting
     * it overlay the plot. The reservation is measured at the text's real
     * rendered size for *this* chart's dimensions, so it tracks
     * `scaleFonts`/`responsive` scaling automatically -- a card a quarter the
     * width reserves what the text actually occupies there, rather than a
     * hand-tuned `spacing` value that was right at only one size.
     *
     * A reserved side's space is added to that side's `spacing`, which stays
     * what it always was -- padding -- rather than doubling as the room a
     * text needs. `verticalAlign:
     * top`/`bottom` takes a band on that edge and wins over `align`, so a
     * corner text reads as a header or footer rather than spending a
     * full-height column on one line; `align: left`/`right` takes a side
     * column only when the text is vertically centred. A centre/centre text
     * is a deliberate overlay and never reserves. Default `false` -- every
     * text overlays the plot, as before.
     */
    autoSpaceTexts?: boolean;
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
  /** Labels, callouts, and point highlights anchored to chart values. */
  annotations?: AnnotationOptions[];
  /** Text blocks positioned from the chart edges or centre. */
  texts?: ChartTextOptions[];
  /** Conditional option overrides matched against the rendered chart size. */
  responsive?: ResponsiveRule[];
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
