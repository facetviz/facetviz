/**
 * Slope chart: one straight line per series connecting its value at each
 * x-category — built for the classic two-column "before → after" / "then →
 * now" comparison (though it draws fine with more than two categories too).
 * Each series is one entity; its colour + the shared legend identify which
 * line is which, so, unlike a dumbbell, there's no separate name label baked
 * into the chart — just the value at each end when `dataLabels` is on.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { linePath, Pt } from './paths.js';
import { drawMarker } from './marker.js';
import { drawDataLabel, labelString, LabelPlacement } from './data-label.js';
import type { Point } from '../core/point.js';

export class SlopeSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer } = ctx;
    const g = renderer.group(
      { class: `facet-series facet-slope ${this.name}` },
      renderer.root,
    );

    const data: Array<{ pt: Pt; p: Point }> = [];
    for (const p of this.points) {
      if (p.y === undefined) continue;
      data.push({ pt: { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(p.y) }, p });
    }
    if (!data.length) return;

    renderer.create(
      'path',
      {
        d: linePath(data.map((d) => d.pt)),
        fill: 'none',
        stroke: this.color,
        'stroke-width': this.options.lineWidth ?? this.options.size ?? 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      },
      g,
    );

    const radius = this.options.marker?.radius ?? 4.5;
    data.forEach(({ pt, p }, i) => {
      const color = p.color ?? this.color;
      const el = drawMarker(renderer, g, pt.x, pt.y, {
        symbol: this.options.marker?.symbol ?? 'circle',
        radius,
        fill: color,
        stroke: '#fff',
        strokeWidth: 1.5,
      });
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) =>
        ctx.onPointEvent('mouseOver', p, e),
      );
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      this.drawLabel(ctx, p, pt, radius, i === 0, i === data.length - 1);
    });
  }

  /** The value at each end (first point labelled to its left, last to its right). */
  private drawLabel(
    ctx: SeriesRenderContext,
    p: Point,
    pt: Pt,
    radius: number,
    isFirst: boolean,
    isLast: boolean,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled || !(isFirst || isLast)) return;
    const text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color,
    });
    const d = dl.distance ?? 0;
    const gap = radius + 6 + d;
    const place: LabelPlacement = isLast
      ? { x: pt.x + gap, y: pt.y + 4, anchor: 'start' }
      : { x: pt.x - gap, y: pt.y + 4, anchor: 'end' };
    drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
}
