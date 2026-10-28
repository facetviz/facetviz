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
// how a chart library can keep each chart type's shape in its own
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
import type { WaterfallPointOptions, WaterfallSeriesOptions } from "../series/waterfall.js";
import type { SankeyPointOptions } from "../series/sankey.js";
import type { MapPointOptions, MapSeriesOptions } from "../series/map.js";
import type { DecompPointOptions, DecompSeriesOptions } from "../series/decomp.js";
import type { HeatmapSeriesOptions } from "../series/heatmap.js";
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
  | "map" // areas filled by their data, and dots by longitude and latitude
  | "decomp" // a total split into its parts, level by level
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
    MapPointOptions,
    DecompPointOptions,
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
    WaterfallSeriesOptions,
    DumbbellSeriesOptions,
    GaugeSeriesOptions,
    HistogramSeriesOptions,
    PieSeriesOptions,
    BubbleSeriesOptions,
    ScatterSeriesOptions,
    SparklineSeriesOptions,
    RadialBarSeriesOptions,
    MapSeriesOptions,
    DecompSeriesOptions,
    HeatmapSeriesOptions,
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
  /**
   * The pane it's drawn in, stacked down from 0 (side by side for horizontal
   * bars): with series in more than one pane, each pane has its own value
   * axis and scale and they share the category axis. See `panes`.
   */
  pane?: number;
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
  /**
   * Column/bar, pie/donut and box plot series: the outline of each bar,
   * slice or box. Unset keeps each type's own (none on bars, white between
   * slices, a darker shade around boxes); either one set draws it, the
   * other defaulting to the fill's colour or 1px. `borderWidth: 0` draws
   * none. Colours may carry their own alpha (`rgba(…)`).
   */
  borderColor?: string;
  borderWidth?: number;
  /** Line-family and area series: SVG dash pattern for the line, e.g. '6 4'
   * (dashed) or '1 4' (dotted). Unset draws a solid line. */
  dashStyle?: string;
  /** Line-family series: opacity (0..1) of the whole series -- line,
   * markers and data labels. Column/bar series: opacity of the bars' fill;
   * their data labels stay fully opaque. Scatter series: opacity of the
   * points' fill, also of points with their own color; their outline
   * stays opaque. */
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
  /** A label's own color from its point (e.g. red below zero); what it
   * returns wins over `color`, nothing returned keeps `color`. Column,
   * bar, line, area, scatter, bubble and waterfall labels. */
  colorOf?: (ctx: LabelContext) => string | null | undefined;
  fontSize?: string;
  fontWeight?: string;
  /** `italic` slants the label. */
  fontStyle?: "normal" | "italic";
  /** `underline` or `line-through` the label. */
  textDecoration?: "none" | "underline" | "line-through";
  /** The label's font, a CSS font-family list (no `var()`: it is an SVG attribute). */
  fontFamily?: string;
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
  /**
   * Label every `every`th point of the series only: points 0, n, 2n … in
   * the series' own order (its data's indexes, so gaps still count). Unset
   * or 1: every point. Line, area, scatter, bubble, column and bar.
   */
  every?: number;
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
  /** What `align` lines up with: the whole chart (default) or the plot
   * area, past the axis labels. Set on the title, it applies to the
   * subtitle too. */
  alignTo?: "chart" | "plot";
  /** Above the plot (default) or under everything else. Set on the title,
   * it applies to the subtitle too. */
  verticalAlign?: "top" | "bottom";
  /** Space below the title block in pixels (above it, at the bottom). */
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
  /** A second, smaller line beyond the title. */
  subtitle?: string;
  subtitleStyle?: Record<string, string>;
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
   * Unrotated labels along the bottom that don't fit their slot break onto
   * a second line at a space (both lines fitting) before being cut short.
   */
  wrap?: boolean;
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
  /**
   * This axis's canvas address, reported in canvas events (`data-fv-id` on
   * its elements). Defaults to `xAxis[0]`, `xAxis[1]`, `yAxis[0]`, `yAxis[1]`.
   */
  id?: string;
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
  /** On a category axis: grid lines through each category ('on', the
   * default) or between neighbouring categories ('between'). */
  gridLinePlacement?: 'on' | 'between';
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
  /** Tick marks' length in px (default 5; outside, at most 8, to leave the
   * labels clear), color (default the axis line's), and side. */
  tickLength?: number;
  tickColor?: string;
  tickPosition?: "outside" | "inside";
  /** A dotted line across the plot at zero, when the axis's range runs
   * through it (continuous axes); an object sets its color, width and dash. */
  zeroLine?: boolean | { color?: string; width?: number; dashStyle?: string };
  /** Short tick marks at the minor intervals (with `minorTickInterval`;
   * `minorGridLineWidth: 0` keeps the ticks without the grid lines). */
  minorTicks?: boolean;
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
  /**
   * `true`: the axis always reaches zero. `false`: it never forces zero, not
   * even under columns and areas (which reach zero by default).
   */
  startOnZero?: boolean;
  /**
   * The axis's range. `fixed` takes `start` / `end` (a number, or `'auto'`
   * for that end); `uniform` gives a repeated axis one range across every
   * pane row (or column) it spans, `independent` each its own; `auto` is
   * uniform. `includeZero` is `startOnZero`.
   */
  range?: {
    mode?: "auto" | "uniform" | "independent" | "fixed";
    start?: number | "auto";
    end?: number | "auto";
    includeZero?: boolean;
  };
  /**
   * With `type: 'log'`: `positive` (default) skips values at or below zero;
   * `symmetric` runs through zero, logarithmic either side of it. `base`
   * sets which powers the ticks fall on (default 10).
   */
  log?: { mode?: "positive" | "symmetric"; base?: number };
  /** Major ticks every `tickInterval` (data units) from `tickOrigin`; `'none'` draws no ticks, labels or grid lines. */
  tickInterval?: number | "none";
  /** Where fixed ticks start counting from. Default 0. */
  tickOrigin?: number;
  /** The axis band's thickness in px (width beside the plot, height below or above). Default measured. */
  size?: number;
  /** On a second value axis: the first axis's range and ticks, so both read on one scale. */
  sync?: boolean;
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
   * Nested axis: which lines divide it. `'groups'` (default) draws one
   * where a group changes, through the plot and its labels, and none
   * between the innermost values within a group (no line between columns,
   * as on a plain category axis); `'all'` draws one between every leaf as
   * well; `'none'` draws none. The baseline stays either way (`lineWidth: 0`
   * hides it).
   */
  groupLines?: "groups" | "all" | "none";
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
  /**
   * Draws the line across only some categories of the other axis, not the
   * whole plot: the categories whose values start with these. On a nested
   * axis, outer values first (`['East']` is every category under East,
   * `['East', 'Phones']` one); on a plain category axis, one category.
   * Matching nothing draws nothing.
   */
  group?: Array<number | string>;
  /** With `group`: the part of a category step left clear at each end (0–0.5). */
  groupPadding?: number;
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
  /** An outline around the band. */
  borderColor?: string;
  borderWidth?: number;
  /** Drawn above the series instead of under them. */
  zIndex?: "above" | "below";
  /** Across only some categories of the other axis, as a plot line's `group`. */
  group?: Array<number | string>;
  /** With `group`: the part of a category step left clear at each end (0–0.5). */
  groupPadding?: number;
  /**
   * Whiskers out of the band's middle to two values, with a cap at each, so
   * a band reads as a box plot's box. Drawn in `borderColor`.
   */
  whiskers?: [number, number];
  label?: { text: string; align?: "left" | "center" | "right"; color?: string };
}

export interface HoverStateOptions {
  enabled?: boolean;
  /** Scale multiplier applied to a point on hover, e.g. 1.06. */
  scale?: number;
  /** Brighten the point colour on hover by this ratio (0..1). */
  brightness?: number;
  /** Outline the point on hover with a border this wide, in px (default 0: none). */
  borderWidth?: number;
  /** The hover border's color (default: a darker shade of the point's own). */
  borderColor?: string;
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

/** What a colour means when points take it by a value of theirs rather
 * than by series: a swatch per value, under a heading. */
export interface LegendColorKey {
  /** The heading: what the values are of. */
  label?: string;
  items: { label: string; color: string }[];
}

export interface LegendOptions {
  enabled?: boolean;
  /**
   * Gradient entries drawn before the series items. Hide the series they
   * stand for with `showInLegend: false`. A legend with a scale renders even
   * with a single entry.
   */
  colorScales?: LegendColorScale[];
  /**
   * Swatches drawn after the colour scales, before the series items; they
   * don't toggle anything. A legend with a key renders even with a single
   * entry.
   */
  colorKeys?: LegendColorKey[];
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

/** One header level, set by its field name in `canvas.headers`. */
export interface CanvasHeaderOptions {
  /** Draw this level. Hidden, it takes no room. Default true. */
  visible?: boolean;
  /** Its band's thickness in px: height across columns, width down rows. */
  size?: number;
  label?: {
    /** CSS-like text style, e.g. `{ fontWeight: '600', color: '#333' }`. */
    style?: Record<string, string>;
    /** Degrees; down rows a header cell's text runs along it at 90 / -90. */
    rotation?: number;
    /** `{value}` template, as on axis labels. */
    format?: string;
  };
  /** Fill behind this level's cells. */
  background?: string;
}

/** Lines between header groups, through the panes and the header levels. */
export interface CanvasDividerOptions {
  /**
   * Which changes draw a line: a header `level` number (that level and every
   * level outside it), `'all'` (every category too) or `'none'`. Default: every
   * header level.
   */
  level?: number | "all" | "none";
  color?: string;
  width?: number;
  dashStyle?: string;
}

/** Every other group shaded, across the panes and its header cells. */
export interface CanvasBandOptions {
  /** Pane fill of the shaded groups. */
  color?: string;
  /** Header cell fill of the shaded groups. Default none. */
  headerColor?: string;
  /** The header level whose groups alternate. Default the innermost. */
  level?: number;
  /** Groups per band. Default 1. */
  size?: number;
}

/** The names of the header fields, beside their levels. */
export interface CanvasFieldLabelOptions {
  visible?: boolean;
  /** Text in place of the field's name, e.g. `Region / Segment` naming
   * the field along the axis inside the panels too. */
  text?: string;
  style?: Record<string, string>;
}

export interface CanvasOptions {
  /** Px between panes of a chart with series in several panes. Default 16. */
  paneGap?: number;
  /**
   * Series in panes (`series.pane`): stacked down as rows, or side by side
   * as columns. Default rows, columns for horizontal bars (along the value
   * axis, sharing the category axis). The other way each pane has its own
   * value axis and category labels. Inside small multiples the panes are
   * the innermost rows or columns, a value scale per pane shared across
   * the panels.
   */
  paneLayout?: "rows" | "columns";
  /**
   * How panes take the chart's room: `entire` (default) fills it both ways;
   * `width` fits pane columns to the width with fixed-height pane rows,
   * `height` the other way round, `standard` fixes both. With a fixed
   * direction the chart grows (or shrinks) to the canvas's natural size,
   * so a host can scroll it.
   */
  fit?: "entire" | "width" | "height" | "standard";
  /**
   * Fixed pane sizes in px: `width` per pane column (per category on a
   * nested axis), `height` per pane row. Defaults 200 / 160 (40 / 24 per category).
   */
  cell?: { width?: number; height?: number };
  /**
   * Axis settings by canvas address (`xAxis[0]`, `yAxis[1]`, or an axis's own
   * `id`), laid over that axis's options.
   */
  axes?: Record<string, AxisOptions>;
  /** Per header level, by field name. */
  headers?: Record<string, CanvasHeaderOptions>;
  /** Dividers between column groups / row groups. */
  dividers?: { columns?: CanvasDividerOptions; rows?: CanvasDividerOptions };
  banding?: { columns?: CanvasBandOptions; rows?: CanvasBandOptions };
  fieldLabels?: { columns?: CanvasFieldLabelOptions; rows?: CanvasFieldLabelOptions };
}

/** One pane of a chart with series in several panes. */
export interface PaneOptions {
  /** Its value axis: laid over the chart's `yAxis`. */
  yAxis?: AxisOptions;
  /** Its share of the room, against the others' (default 1). */
  weight?: number;
}

/** Small-multiples configuration. */
export interface TrellisOptions {
  /** Dimension used to split panels horizontally (columns of the grid). */
  columns?: string;
  /** Dimension used to split panels vertically (rows of the grid). */
  rows?: string;
  /**
   * The column panels' values in order (others after, as found). By default
   * panels go in the order their values are first met in the points, which
   * on a numeric x axis is the order of the x values.
   */
  columnOrder?: string[];
  /** The row panels' values in order, as `columnOrder`. */
  rowOrder?: string[];
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
  /** A part of the canvas (an axis, axis title, the plot area, a title…) clicked. */
  canvasClick?: (ev: CanvasObjectEvent) => void;
  /** A part of the canvas double-clicked. */
  canvasDoubleClick?: (ev: CanvasObjectEvent) => void;
  /**
   * An axis band or header level dragged to a new thickness. Setting this
   * puts a resize handle on each band's edge facing the panes. `phase` is
   * `move` while dragging and `end` on release; facetviz only reports it —
   * store `size` in `canvas.axes[id].size` / `canvas.headers[id].size`.
   */
  canvasResize?: (ev: CanvasResizeEvent) => void;
  /** With a fixed `canvas.fit`: the size the chart took to hold its canvas. */
  canvasNaturalSize?: (size: { width: number; height: number }) => void;
  /**
   * A part of the canvas right-clicked. When set, the browser's own context
   * menu doesn't open over canvas parts.
   */
  canvasContextMenu?: (ev: CanvasObjectEvent) => void;
}

/**
 * The kinds of canvas part a canvas event can report. `grid` is an axis's
 * grid lines or alternate bands, `plotLine` / `plotBand` its reference
 * lines and bands; each carries the axis's id.
 */
export type CanvasObjectKind =
  | "axis"
  | "axisTitle"
  | "grid"
  | "plotLine"
  | "plotBand"
  | "plotArea"
  | "title"
  | "subtitle"
  | "legend"
  | "header"
  | "fieldLabel";

export interface CanvasResizeEvent {
  phase: "move" | "end";
  kind: "axis" | "header";
  /** The axis's canvas id, or the header's field. */
  id: string;
  /** The new thickness in px. */
  size: number;
  /** Which side of the panes the band is on. */
  side: "left" | "right" | "top" | "bottom";
}

export interface CanvasObjectEvent {
  type: "click" | "dblclick" | "contextmenu";
  kind: CanvasObjectKind;
  /** The part's address: an axis's id, `plotArea`, `title`, `subtitle`, `legend`; a header's field. */
  id: string;
  /** A header cell's value, outer levels first (`['East', 'Tech']`); on an
   * `axis`, the category whose label it was (`['West']`); on the `legend`,
   * the item's label (`['Tech']`). */
  path?: string[];
  /** Which copy of a repeated part, e.g. a small-multiples cell (`row:col`). */
  instance?: string;
  domEvent: MouseEvent;
}

export interface SeriesEvents {
  click?: (ev: FacetVizPointEvent) => void;
  /**
   * A point right-clicked (or its menu key / Shift+F10 pressed while it has
   * focus). When set, the browser's own context menu doesn't open.
   */
  contextMenu?: (ev: FacetVizPointEvent) => void;
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
  /** Auto-enable boost once a boostable series exceeds this many points, or all of them together ten times it (default 1500). */
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
    /** px between the plot and the chart's edge (inside `spacing`) on each
     * side with no visible axis: one number, or top, right, bottom, left.
     * Default 6 above and below, 8 at the sides. 0 lets columns and areas
     * stand right on the bottom edge, e.g. level with text beside them. */
    plotPadding?: number | [number, number, number, number];
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
     * High-volume "boost" rendering. Cartesian point, line, column and bar
     * series (bars grouped or stacked, and stacked areas) past `threshold`
     * points are drawn to a single canvas overlay instead of one SVG node
     * per point, and lines are min/max-decimated to the pixel resolution.
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
  /** Header levels, dividers, banding and field labels of a chart laid out as a canvas (the nested x axis). */
  canvas?: CanvasOptions;
  /**
   * With series in several panes (`series.pane`): each pane's settings, by
   * pane number — its value axis (laid over `yAxis`; its title defaults to
   * its series' names) and its share of the height.
   */
  panes?: PaneOptions[];
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
