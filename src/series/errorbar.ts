/**
 * Error-bar series — a thin vertical (or horizontal, when inverted) whisker with
 * caps spanning `low`→`high` at each category. Typically overlaid on a column or
 * line series to show uncertainty / confidence intervals.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale, Scale } from '../core/scale.js';
import type { Point } from '../core/point.js';

export class ErrorBarSeries extends BaseSeries {
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
    const g = renderer.group({ class: `jchart-series jchart-errorbar ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const sub = band / groupCount;
    const cap = Math.min(sub * 0.4, 8);
    const stroke = this.color;

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const c = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * sub;
      const vLo = valScale.scale(p.low), vHi = valScale.scale(p.high);
      const line = (a: Record<string, number>) => renderer.create('line', { ...a, stroke, 'stroke-width': 1.5, class: 'jchart-point' }, g);
      const el = inverted
        ? line({ x1: vLo, y1: c, x2: vHi, y2: c })
        : line({ x1: c, y1: vLo, x2: c, y2: vHi });
      // Caps.
      if (inverted) {
        line({ x1: vLo, y1: c - cap, x2: vLo, y2: c + cap });
        line({ x1: vHi, y1: c - cap, x2: vHi, y2: c + cap });
      } else {
        line({ x1: c - cap, y1: vLo, x2: c + cap, y2: vLo });
        line({ x1: c - cap, y1: vHi, x2: c + cap, y2: vHi });
      }
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
    }
  }
}
