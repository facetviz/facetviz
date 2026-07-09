/**
 * Public configuration types for JChart.
 *
 * The shape intentionally mirrors Highcharts so that users familiar with that
 * library can migrate with minimal changes:
 *
 *   new JChart(container, {
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

import type { ThemeInput } from './theme.js';

/** Every built-in series/chart type. */
export type ChartType =
  | 'bar' // horizontal bars
  | 'column' // vertical bars
  | 'arearange' // filled band between a low and high value
  | 'areasplinerange' // smoothed range band
  | 'line'
  | 'spline' // smoothed line
  | 'step' // step line
  | 'area'
  | 'areaspline'
  | 'pie'
  | 'donut' // pie with an inner radius
  | 'scatter'
  | 'jitter' // scatter with categorical x + random spread
  | 'boxplot'
  | 'dumbbell' // two connected points per category (low → high)
  | 'butterfly' // two series mirrored back-to-back around a central axis
  | 'radialbar'; // bars drawn around a polar centre

export type StackingMode = 'normal' | 'percent';

/** A single datum. Many shapes are accepted for author convenience. */
export type PointInput =
  | number // y only; x taken from index or categories
  | [number | string, number] // [x, y]
  | [number | string, number, number] // [x, low, high] for range/boxplot lows
  | PointOptions
  | null;

export interface PointOptions {
  x?: number | string;
  y?: number;
  /** Range / dumbbell charts (arearange, areasplinerange, dumbbell). */
  low?: number;
  high?: number;
  /** Boxplot. */
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number;
  /** Pie / categorical slices. */
  name?: string;
  /** Per-point colour override. */
  color?: string;
  /** Freeform payload surfaced back to the user in tooltips and events. */
  [key: string]: unknown;
}

export interface SeriesOptions {
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
  /** Pie/donut inner radius as a percentage string e.g. '60%'. */
  innerSize?: string;
  /**
   * Pie/donut multi-level (two-dimension) rings: field names read from each
   * point. The first is the inner ring (grouped totals), the second the outer
   * ring (breakdown within each inner slice). Outer slices are shaded variants
   * of their parent's colour.
   */
  dimensions?: string[];
  /** Line width in px for line-family series. */
  lineWidth?: number;
  /** Marker configuration for point-based series. */
  marker?: MarkerOptions;
  dataLabels?: DataLabelOptions;
  /** Amount of horizontal jitter (in category widths) for jitter charts. */
  jitter?: number;
  /** Boxplot colours. Set `lower`/`upper` to two distinct hues for a
   *  split-colour box, or leave unset for two shades of the series colour. */
  boxColors?: {
    lower?: string;
    upper?: string;
    median?: string;
    whisker?: string;
    border?: string;
  };
  /** Dumbbell endpoint / connector colours. */
  lowColor?: string;
  highColor?: string;
  connectorColor?: string;
  connectorWidth?: number;
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
  symbol?: 'circle' | 'square' | 'diamond' | 'triangle';
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
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
  position?: 'outside' | 'inside' | 'center' | 'base' | 'top' | 'bottom' | 'left' | 'right';
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
}

export interface TitleOptions {
  text?: string;
  align?: 'left' | 'center' | 'right';
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
  type?: 'linear' | 'log' | 'category';
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
  /** Reference lines drawn across the plot at fixed axis values. */
  plotLines?: PlotLineOptions[];
  /** Shaded reference bands spanning an axis value interval. */
  plotBands?: PlotBandOptions[];
  /** Reverse the axis direction. */
  reversed?: boolean;
  /** Set on a value axis to start at zero regardless of data. */
  startOnZero?: boolean;
  /**
   * Tableau-style splitting: bind this axis to a data dimension so the chart
   * is broken into a grid of panels (small multiples). See `trellis`.
   */
  dimension?: string;
  /**
   * Tableau-style nested axis: two or more dimension field names to arrange as
   * a hierarchy along this axis. The measure (`y`) is aggregated (summed) for
   * each leaf combination and the axis renders grouped headers with dividers —
   * the look Tableau produces when several dimensions sit on the columns shelf.
   */
  dimensions?: string[];
  /** Aggregation used when collapsing points into nested-axis leaves. */
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface PlotLineOptions {
  /** Axis value the line is drawn at. */
  value: number | string;
  color?: string;
  width?: number;
  /** Dash pattern, e.g. '4 3'. */
  dashStyle?: string;
  /** Stacking order relative to the series (default drawn above grid, below series). */
  zIndex?: 'above' | 'below';
  label?: { text: string; align?: 'left' | 'center' | 'right'; color?: string };
}

export interface PlotBandOptions {
  /** Band start value (inclusive). */
  from: number | string;
  /** Band end value. */
  to: number | string;
  color?: string;
  label?: { text: string; align?: 'left' | 'center' | 'right'; color?: string };
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
  'format' | 'formatter' | 'valueSuffix' | 'valuePrefix' | 'valueDecimals'
>;

export interface TooltipContext {
  series: string;
  x: number | string;
  y: number | undefined;
  point: PointOptions;
  color: string;
  /** Range series low/high. */
  low?: number;
  high?: number;
  /** Boxplot five-number summary. */
  box?: { min: number; q1: number; median: number; q3: number; max: number };
  /** All points sharing this x, when `shared` is enabled. */
  points?: TooltipContext[];
}

export interface LegendOptions {
  enabled?: boolean;
  /** Horizontal alignment (top/bottom legends) or which side (vertical legends). */
  align?: 'left' | 'center' | 'right';
  /** Vertical placement for a horizontal legend. */
  verticalAlign?: 'top' | 'bottom';
  /**
   * Item flow. `horizontal` (default) → a strip at top/bottom; `vertical` →
   * a stacked column placed on the left or right (per `align`).
   */
  layout?: 'horizontal' | 'vertical';
  itemStyle?: Record<string, string>;
}

export interface PlotOptions {
  /** Defaults applied to every series. */
  series?: Partial<SeriesOptions>;
  /** Per-type defaults, e.g. { column: { stacking: 'normal' } }. */
  [type: string]: Partial<SeriesOptions> | undefined;
}

/** Tableau small-multiples configuration. */
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
   * Render as a Tableau-style table: a single shared y-axis on the left and
   * x-axis along the bottom, with row/column dimension names shown once as
   * headers rather than repeating a full axis in every cell. Default true.
   */
  table?: boolean;
}

/** Chart-wide events. Individual point events are wired through series. */
export interface ChartEvents {
  load?: (chart: unknown) => void;
  render?: (chart: unknown) => void;
  click?: (ev: JChartPointEvent) => void;
}

export interface SeriesEvents {
  click?: (ev: JChartPointEvent) => void;
  mouseOver?: (ev: JChartPointEvent) => void;
  mouseOut?: (ev: JChartPointEvent) => void;
  legendItemClick?: (ev: { series: string; visible: boolean }) => void;
}

export interface JChartPointEvent {
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
  /**
   * Visual theme. A built-in name (`'light'` | `'dark'` | `'high-contrast'` |
   * `'pastel'`), or a custom object (optionally extending a built-in via `base`).
   * Explicit `colors` / `chart.backgroundColor` / axis colours still win.
   */
  theme?: ThemeInput;
  /** Wire series-level events without repeating on every series. */
  seriesEvents?: SeriesEvents;
}
