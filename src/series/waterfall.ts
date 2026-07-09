/**
 * Waterfall series. Each point is a delta added to a running total, drawn as a
 * floating bar from the previous cumulative to the new one. Points flagged
 * `isSum` / `isIntermediateSum` draw an absolute bar from zero to the running
 * total. Rises, falls and sums are coloured distinctly, with connector lines.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale } from '../core/scale.js';

export class WaterfallSeries extends BaseSeries {
  private colors = { up: '#26a69a', down: '#ef5350', sum: '#4472c4' };

  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  /** Cumulative extent so the value axis fits every floating bar. */
  override valueExtent(): [number, number] {
    let cum = 0, min = 0, max = 0;
    for (const p of this.points) {
      if (p.options.isSum || p.options.isIntermediateSum) {
        min = Math.min(min, cum); max = Math.max(max, cum);
      } else {
        const prev = cum; cum += p.y ?? 0;
        min = Math.min(min, prev, cum); max = Math.max(max, prev, cum);
      }
    }
    return [min, max];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, yScale } = ctx;
    const catScale = ctx.xScale as CategoryScale;
    const g = renderer.group({ class: `jchart-series jchart-waterfall ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const barW = band * 0.6;
    const zeroY = yScale.scale(0);

    let cum = 0;
    let prevEndX: number | null = null;
    let prevY = zeroY;

    for (const p of this.points) {
      const isSum = !!(p.options.isSum || p.options.isIntermediateSum);
      const from = isSum ? 0 : cum;
      const to = isSum ? cum : cum + (p.y ?? 0);
      if (!isSum) cum = to;

      const cx = catScale.scale(p.x);
      const x0 = cx - barW / 2;
      const yTop = yScale.scale(Math.max(from, to));
      const yBot = yScale.scale(Math.min(from, to));
      const color = p.color ?? (isSum ? this.colors.sum : to >= from ? this.colors.up : this.colors.down);

      // Connector from the previous bar's end level.
      if (prevEndX !== null) {
        renderer.create('line', { x1: prevEndX, y1: prevY, x2: x0, y2: prevY, stroke: '#b0b0b0', 'stroke-width': 1, 'stroke-dasharray': '2 2' }, g);
      }

      const el = renderer.create('rect', {
        x: x0, y: yTop, width: barW, height: Math.max(1, yBot - yTop),
        fill: color, class: 'jchart-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      prevEndX = x0 + barW;
      prevY = yScale.scale(to);
    }
  }
}
