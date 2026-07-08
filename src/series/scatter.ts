/**
 * Scatter and jitter series. Both plot individual markers; jitter adds a
 * deterministic horizontal spread so overlapping categorical points separate
 * out (useful for distribution views).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale } from '../core/scale.js';
import { drawMarker } from './marker.js';
import { seededRandom } from '../core/utils.js';
import { drawPointLabels } from './data-label.js';
import type { Pt } from './paths.js';
import type { Point } from '../core/point.js';

export class ScatterSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  private get isJitter(): boolean {
    return this.type === 'jitter';
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, xScale } = ctx;
    const g = renderer.group({ class: `jchart-series jchart-scatter ${this.name}` }, renderer.root);

    const marker = this.options.marker ?? {};
    const rng = seededRandom(this.index * 7919 + this.points.length + 1);
    const band = xScale instanceof CategoryScale ? xScale.bandwidth() : 0;
    const spread = (this.options.jitter ?? 0.5) * band;
    const labelData: Array<{ pt: Pt; p: Point }> = [];

    for (const p of this.points) {
      if (p.y === undefined) continue;
      let x = xScale.scale(p.x);
      if (this.isJitter && band > 0) {
        x += (rng() - 0.5) * spread;
      }
      const y = ctx.yScale.scale(p.y);
      labelData.push({ pt: { x, y }, p });
      const el = drawMarker(renderer, g, x, y, {
        symbol: marker.symbol ?? 'circle',
        radius: marker.radius ?? 5,
        fill: p.color ?? marker.fillColor ?? this.color,
        stroke: marker.lineColor ?? '#ffffff',
        strokeWidth: marker.lineWidth ?? 1,
      });
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }
    drawPointLabels(renderer, g, this.options.dataLabels, this.name, labelData);
  }
}
