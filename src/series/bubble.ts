/**
 * Bubble series — a scatter whose marker radius encodes a third value (`z`).
 * `z` is mapped onto `sizeRange` (default 6–34 px) by area, so perceived size is
 * proportional to value. Semi-transparent fills so overlaps stay readable.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { alpha } from '../core/colors.js';
import { drawMarker } from './marker.js';
import { drawPointLabels } from './data-label.js';
import type { Pt } from './paths.js';
import type { Point } from '../core/point.js';

/** Bubble's series-level fields. Its point-level `z` isn't listed here
 *  because it's shared with pie's variable-radius slices — see `PointOptions`
 *  in core/options.ts. */
export interface BubbleSeriesOptions {
  /** Marker radius range [min, max] in px, mapped from each point's `z`. */
  sizeRange?: [number, number];
}

export class BubbleSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, xScale, yScale } = ctx;
    const g = renderer.group({ class: `facet-series facet-bubble ${this.name}` }, renderer.root);

    const zs = this.points.map((p) => (p.options.z as number) ?? 1);
    const zMin = Math.min(...zs), zMax = Math.max(...zs);
    const [rMin, rMax] = this.options.sizeRange ?? [6, 34];
    // Map z → radius by area so value ∝ visual area, not radius.
    const radiusFor = (z: number) => {
      const t = zMax === zMin ? 1 : (z - zMin) / (zMax - zMin);
      return Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
    };

    const labelData: Array<{ pt: Pt; p: Point }> = [];
    for (const p of this.points) {
      if (p.y === undefined) continue;
      const x = xScale.scale(p.x);
      const y = yScale.scale(p.y);
      const base = p.color ?? this.color;
      const el = drawMarker(renderer, g, x, y, {
        symbol: this.options.marker?.symbol ?? 'circle',
        radius: radiusFor((p.options.z as number) ?? 1),
        fill: alpha(base, 0.55), stroke: base, strokeWidth: 1,
      });
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
      labelData.push({ pt: { x, y }, p });
    }
    drawPointLabels(renderer, g, this.options.dataLabels, this.name, labelData, this.color);
  }
}
