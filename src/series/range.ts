/**
 * Range series: `arearange` and `areasplinerange`.
 *
 * Each point carries a `low`/`high` pair and the series fills the band between
 * them — the canonical "range chart" (e.g. daily temperature min/max). The
 * upper and lower boundaries are stroked, and markers are drawn at both ends so
 * every point is hoverable.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { Point } from '../core/point.js';
import { linePath, splinePath, Pt } from './paths.js';
import { alpha } from '../core/colors.js';
import { drawMarker } from './marker.js';

export class RangeSeries extends BaseSeries {
  private smooth(): boolean {
    return this.type === 'areasplinerange';
  }

  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    return [p.low, p.high];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, xScale, yScale } = ctx;
    const g = renderer.group({ class: `jchart-series jchart-arearange ${this.name}` }, renderer.root);

    const top: Pt[] = [];
    const bottom: Pt[] = [];
    const drawn: Point[] = [];
    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const x = xScale.scale(p.x);
      top.push({ x, y: yScale.scale(p.high) });
      bottom.push({ x, y: yScale.scale(p.low) });
      drawn.push(p);
    }
    if (!top.length) return;

    const line = this.smooth() ? splinePath : linePath;
    const topD = line(top);
    const bottomD = line([...bottom].reverse()).replace(/^M/, 'L');

    // Filled band.
    renderer.create('path', { d: `${topD} ${bottomD} Z`, fill: alpha(this.color, 0.35), stroke: 'none' }, g);
    // Boundary strokes.
    renderer.create('path', { d: topD, fill: 'none', stroke: this.color, 'stroke-width': this.options.lineWidth ?? 2 }, g);
    renderer.create('path', { d: line(bottom), fill: 'none', stroke: this.color, 'stroke-width': this.options.lineWidth ?? 2 }, g);

    // Hoverable markers at each end.
    drawn.forEach((p, i) => {
      for (const pt of [top[i], bottom[i]]) {
        const el = drawMarker(renderer, g, pt.x, pt.y, {
          symbol: 'circle', radius: 3.5, fill: this.color, stroke: '#fff', strokeWidth: 1,
        });
        ctx.registerHover(el, p);
        el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
        el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
        el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
      }
    });
  }
}
