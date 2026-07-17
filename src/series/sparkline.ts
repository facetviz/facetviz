/**
 * Sparkline: a tiny, axis-less trend line — meant for one per table row/cell,
 * not as a standalone chart. `chart.type: 'sparkline'` also switches the
 * chart's own defaults (axes, legend) off, see `resolveChartOptions`.
 *
 * The line itself is deliberately plain (thin, no markers along the path —
 * that's what makes it read as "a spark" rather than a small line chart).
 * What actually carries information at this size is a couple of highlighted
 * points: the last one by default (where are we now), and min/max opt-in
 * (`series.sparkline: { min: true, max: true }`).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { Point } from '../core/point.js';
import type { SparklineOptions } from '../core/options.js';
import type { Renderer } from '../core/renderer.js';
import { linePath, Pt } from './paths.js';
import { drawMarker } from './marker.js';

const MIN_COLOR = '#e63946';
const MAX_COLOR = '#00b894';

export class SparklineSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer } = ctx;
    const g = renderer.group(
      { class: `facet-series facet-sparkline ${this.name}` },
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
        'stroke-width': this.options.lineWidth ?? 1.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      },
      g,
    );

    // Invisible hit targets on every point so hover/tooltip still work,
    // even where there's no visible marker.
    for (const { pt, p } of data) {
      const hit = renderer.create(
        'circle',
        { cx: pt.x, cy: pt.y, r: 6, fill: 'transparent', 'pointer-events': 'all' },
        g,
      );
      ctx.registerHover(hit, p);
      hit.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      hit.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      hit.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }

    this.drawHighlights(renderer, g, data);
  }

  /** The last/min/max point markers, per `series.sparkline`. */
  private drawHighlights(
    renderer: Renderer,
    g: SVGGElement,
    data: Array<{ pt: Pt; p: Point }>,
  ): void {
    const opts: SparklineOptions = this.options.sparkline ?? {};
    const radius = this.options.marker?.radius ?? 2.5;
    const dot = (
      point: { pt: Pt; p: Point },
      spec: boolean | { color?: string } | undefined,
      defaultColor: string,
    ): void => {
      if (!spec) return;
      const color = (typeof spec === 'object' ? spec.color : undefined) ?? defaultColor;
      drawMarker(renderer, g, point.pt.x, point.pt.y, {
        symbol: this.options.marker?.symbol ?? 'circle',
        radius,
        fill: color,
        stroke: '#fff',
        strokeWidth: 1,
      });
    };

    // `last` defaults on; `min`/`max` are opt-in (undefined -> not drawn).
    dot(data[data.length - 1], opts.last ?? true, this.color);

    if (opts.min || opts.max) {
      let minPt = data[0];
      let maxPt = data[0];
      for (const d of data) {
        if ((d.p.y ?? 0) < (minPt.p.y ?? 0)) minPt = d;
        if ((d.p.y ?? 0) > (maxPt.p.y ?? 0)) maxPt = d;
      }
      dot(minPt, opts.min, MIN_COLOR);
      dot(maxPt, opts.max, MAX_COLOR);
    }
  }
}
