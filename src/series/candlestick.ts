/**
 * Candlestick (OHLC) series. Each point supplies `open`, `high`, `low`, `close`
 * (via point options). A thin wick spans low→high; the body spans open→close and
 * is coloured green when the period closed up, red when it closed down.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale } from '../core/scale.js';
import type { Point } from '../core/point.js';

const UP = '#26a69a';
const DOWN = '#ef5350';

/** Candlestick's point-level fields — OHLC (`low`/`high` are the shared range pair). */
export interface CandlestickPointOptions {
  open?: number;
  close?: number;
}

export class CandlestickSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    const o = p.options;
    return [o.low as number, o.high as number];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, yScale } = ctx;
    const catScale = ctx.xScale as CategoryScale;
    const g = renderer.group({ class: `facet-series facet-candlestick ${this.name}` }, renderer.root);
    const bodyW = Math.min(catScale.bandwidth() * 0.6, 18);

    for (const p of this.points) {
      const o = p.options;
      const open = o.open!, close = o.close!, high = o.high!, low = o.low!;
      if ([open, close, high, low].some((v) => typeof v !== 'number')) continue;
      const cx = catScale.scale(p.x);
      const up = close >= open;
      const color = p.color ?? (up ? UP : DOWN);

      const cell = renderer.group({ class: 'facet-point' }, g);
      // Wick.
      renderer.create('line', {
        x1: cx, y1: yScale.scale(high), x2: cx, y2: yScale.scale(low), stroke: color, 'stroke-width': 1,
      }, cell);
      // Body.
      const yOpen = yScale.scale(open), yClose = yScale.scale(close);
      renderer.create('rect', {
        x: cx - bodyW / 2, y: Math.min(yOpen, yClose), width: bodyW,
        height: Math.max(1, Math.abs(yClose - yOpen)), fill: color, stroke: color,
      }, cell);

      ctx.registerHover(cell, p);
      cell.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      cell.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      cell.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }
  }
}
