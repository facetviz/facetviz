/**
 * Maps a {@link ChartType} to the series class that renders it.
 *
 * Adding a new chart type is a two-line change here plus one new module —
 * deliberately simple so the library stays hand-maintainable.
 */

import type { ChartType, SeriesOptions } from '../core/options.js';
import { BaseSeries } from './base.js';
import { ColumnSeries } from './column.js';
import { RangeSeries } from './range.js';
import { LineSeries } from './line.js';
import { AreaSeries } from './area.js';
import { ScatterSeries } from './scatter.js';
import { PieSeries } from './pie.js';
import { BoxplotSeries } from './boxplot.js';
import { DumbbellSeries } from './dumbbell.js';
import { RadialBarSeries } from './radialbar.js';
import { ColumnRangeSeries } from './columnrange.js';
import { HeatmapSeries } from './heatmap.js';
import { BulletSeries } from './bullet.js';
import { CandlestickSeries } from './candlestick.js';
import { GaugeSeries } from './gauge.js';
import { WaterfallSeries } from './waterfall.js';
import { HistogramSeries } from './histogram.js';
import { TimelineSeries } from './timeline.js';
import { FunnelSeries } from './funnel.js';
import { TreegraphSeries } from './treegraph.js';

type SeriesCtor = new (options: SeriesOptions, categories?: string[]) => BaseSeries;

const REGISTRY: Record<ChartType, SeriesCtor> = {
  bar: ColumnSeries,
  column: ColumnSeries,
  arearange: RangeSeries,
  areasplinerange: RangeSeries,
  line: LineSeries,
  spline: LineSeries,
  step: LineSeries,
  area: AreaSeries,
  areaspline: AreaSeries,
  pie: PieSeries,
  donut: PieSeries,
  scatter: ScatterSeries,
  jitter: ScatterSeries,
  boxplot: BoxplotSeries,
  dumbbell: DumbbellSeries,
  // Butterfly is laid out by the chart (back-to-back); series just hold data.
  butterfly: ColumnSeries,
  columnrange: ColumnRangeSeries,
  radialbar: RadialBarSeries,
  heatmap: HeatmapSeries,
  bullet: BulletSeries,
  candlestick: CandlestickSeries,
  gauge: GaugeSeries,
  waterfall: WaterfallSeries,
  histogram: HistogramSeries,
  timeline: TimelineSeries,
  funnel: FunnelSeries,
  treegraph: TreegraphSeries,
};

export function createSeries(
  type: ChartType,
  options: SeriesOptions,
  categories?: string[],
): BaseSeries {
  const Ctor = REGISTRY[type];
  if (!Ctor) throw new Error(`JChart: unknown series type "${type}"`);
  return new Ctor(options, categories);
}

/** Register a custom series type at runtime (extensibility hook). */
export function registerSeriesType(type: string, ctor: SeriesCtor): void {
  (REGISTRY as Record<string, SeriesCtor>)[type] = ctor;
}
