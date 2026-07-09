/**
 * Histogram series. Takes an array of raw numbers and bins them into a frequency
 * distribution rendered as adjacent bars. The bin count defaults to the
 * square-root rule but can be set via `options.bins`.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { SeriesOptions } from '../core/options.js';
import type { Point } from '../core/point.js';

interface Bin { x0: number; x1: number; count: number; }

export class HistogramSeries extends BaseSeries {
  private bins: Bin[] = [];

  constructor(options: SeriesOptions, categories?: string[]) {
    super(options, categories);
    this.bins = this.computeBins();
    // Points sit at bin centres (numeric x) so the chart builds a linear x-axis.
    this.points = this.bins.map((b, i) => ({
      x: (b.x0 + b.x1) / 2,
      y: b.count,
      index: i,
      options: { x0: b.x0, x1: b.x1, y: b.count } as Point['options'],
    }));
  }

  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  override valueExtent(): [number, number] {
    return [0, Math.max(1, ...this.bins.map((b) => b.count))];
  }

  private computeBins(): Bin[] {
    const values = (this.options.data as unknown[]).filter((v): v is number => typeof v === 'number');
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const count = (this.options.bins as number) ?? Math.max(1, Math.ceil(Math.sqrt(values.length)));
    const width = (max - min) / count || 1;
    const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count: 0 }));
    for (const v of values) {
      const idx = Math.min(count - 1, Math.floor((v - min) / width));
      bins[idx].count++;
    }
    return bins;
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, xScale, yScale } = ctx;
    const g = renderer.group({ class: `jchart-series jchart-histogram ${this.name}` }, renderer.root);
    const zeroY = yScale.scale(0);

    this.points.forEach((p) => {
      const b = { x0: p.options.x0 as number, x1: p.options.x1 as number };
      const xa = xScale.scale(b.x0);
      const xb = xScale.scale(b.x1);
      const yTop = yScale.scale(p.y ?? 0);
      const el = renderer.create('rect', {
        x: Math.min(xa, xb) + 0.5, y: yTop, width: Math.max(1, Math.abs(xb - xa) - 1),
        height: Math.max(0, zeroY - yTop), fill: p.color ?? this.color, class: 'jchart-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    });
  }
}
