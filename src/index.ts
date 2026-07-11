/**
 * JChart — public entry point.
 *
 * @example
 * import { JChart } from 'jchart';
 * const chart = new JChart('#container', {
 *   chart: { type: 'column' },
 *   title: { text: 'Fruit consumption' },
 *   xAxis: { categories: ['Apples', 'Pears', 'Bananas'] },
 *   yAxis: { title: { text: 'Units' } },
 *   series: [{ name: 'Jane', data: [1, 5, 3] }, { name: 'John', data: [4, 2, 6] }],
 * });
 */

export { JChart } from './core/chart.js';
export { JChart as Chart } from './core/chart.js';

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
  JChartPointEvent,
} from './core/options.js';

// Theming.
export { resolveTheme, registerTheme, LIGHT_THEME } from './core/theme.js';
export type { Theme, ThemeInput } from './core/theme.js';

// Extensibility.
export { registerSeriesType, createSeries } from './series/registry.js';
export { BaseSeries } from './series/base.js';
export type { SeriesRenderContext, SeriesCapabilities } from './series/base.js';

// Scales & helpers usable by custom series.
export { LinearScale, LogScale, CategoryScale } from './core/scale.js';
export type { Scale } from './core/scale.js';
export { Renderer } from './core/renderer.js';
export { computeBoxStats } from './series/boxplot.js';
export { DEFAULT_COLORS } from './core/colors.js';

// Text formatting helpers (usable standalone).
export {
  formatString,
  formatValue,
  formatNumber,
  formatDate,
  abbreviateNumber,
  groupThousands,
} from './core/utils.js';
