/**
 * Column range / bar range as a rounded "capsule": a thick line from `low` to
 * `high` with circular ends (like a dumbbell, but a single solid bar). Vertical
 * by default (category on x); horizontal when `chart.inverted` is set. Multiple
 * series group side-by-side within each category band.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale, Scale } from '../core/scale.js';
import type { Point } from '../core/point.js';

export class ColumnRangeSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    return [p.low, p.high];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale: Scale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group({ class: `jchart-series jchart-columnrange ${this.name}` }, renderer.root);

    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    const thickness = Math.min(subWidth * 0.55, 26);

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vLow = valScale.scale(p.low);
      const vHigh = valScale.scale(p.high);
      const coords = inverted
        ? { x1: vLow, y1: cat, x2: vHigh, y2: cat }
        : { x1: cat, y1: vLow, x2: cat, y2: vHigh };

      const el = renderer.create('line', {
        ...coords, stroke: p.color ?? this.color,
        'stroke-width': thickness, 'stroke-linecap': 'round', class: 'jchart-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }
  }
}
