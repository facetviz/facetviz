/**
 * Area / areaspline series. Extends {@link LineSeries} for the top boundary and
 * closes the shape down to a baseline — which follows the stack floor when the
 * series is stacked, giving correct stacked-area rendering.
 */

import { LineSeries } from './line.js';
import { SeriesRenderContext } from './base.js';
import { alpha } from '../core/colors.js';
import { linePath, splinePath, Pt } from './paths.js';
import type { Point } from '../core/point.js';
import { drawPointLabels } from './data-label.js';

export class AreaSeries extends LineSeries {
  private smooth(): boolean {
    return this.type === 'areaspline';
  }

  protected override buildPath(pts: Pt[]): string {
    return this.smooth() ? splinePath(pts) : linePath(pts);
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer } = ctx;
    const g = renderer.group({ class: `facet-series facet-area ${this.name}` }, renderer.root);

    const top: Pt[] = [];
    const bottom: Pt[] = [];
    const hover: Array<{ pt: Pt; p: Point }> = [];

    for (const p of this.points) {
      const hi = p.stackHigh !== undefined ? p.stackHigh : p.y;
      if (hi === undefined) continue;
      const lo = p.stackLow !== undefined ? p.stackLow : 0;
      const topPt = { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(hi) };
      top.push(topPt);
      bottom.push({ x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(lo) });
      hover.push({ pt: topPt, p });
    }

    if (top.length) {
      const line = this.smooth() ? splinePath : linePath;
      const topD = line(top);
      // Trace the bottom boundary in reverse to close the polygon.
      const bottomReversed = [...bottom].reverse();
      const bottomD = line(bottomReversed).replace(/^M/, 'L');
      renderer.create('path', {
        d: `${topD} ${bottomD} Z`,
        fill: alpha(this.color, 0.35),
        stroke: 'none',
      }, g);

      // Top boundary stroke.
      renderer.create('path', {
        d: topD,
        fill: 'none',
        stroke: this.color,
        'stroke-width': this.options.lineWidth ?? this.options.size ?? 2,
        'stroke-linejoin': 'round',
      }, g);
    }

    this.renderMarkers(ctx, g, hover);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, hover, this.color);
  }
}
