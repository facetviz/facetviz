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

    let top: Pt[] = [];
    let bottom: Pt[] = [];
    const hover: Array<{ pt: Pt; p: Point }> = [];
    // `chart.inverted` swaps which scale carries the category vs. the
    // value axis (same convention as ColumnSeries.render / LineSeries).
    const catScale = ctx.inverted ? ctx.yScale : ctx.xScale;
    const valScale = ctx.inverted ? ctx.xScale : ctx.yScale;

    const drawSegment = () => {
      if (!top.length) return;
      const line = this.smooth() ? splinePath : linePath;
      const topD = line(top);
      const bottomD = line([...bottom].reverse()).replace(/^M/, 'L');
      renderer.create('path', {
        d: `${topD} ${bottomD} Z`,
        fill: alpha(this.color, 0.35),
        stroke: 'none',
      }, g);
      renderer.create('path', {
        d: topD,
        fill: 'none',
        stroke: this.color,
        'stroke-width': this.options.lineWidth ?? this.options.size ?? 2,
        'stroke-linejoin': 'round',
      }, g);
      top = [];
      bottom = [];
    };

    for (const p of this.points) {
      const hi = p.stackHigh !== undefined ? p.stackHigh : p.y;
      if (hi === undefined) {
        drawSegment();
        continue;
      }
      const lo = p.stackLow !== undefined ? p.stackLow : 0;
      const catPx = catScale.scale(p.x);
      const topPt = ctx.inverted
        ? { x: valScale.scale(hi), y: catPx }
        : { x: catPx, y: valScale.scale(hi) };
      const botPt = ctx.inverted
        ? { x: valScale.scale(lo), y: catPx }
        : { x: catPx, y: valScale.scale(lo) };
      top.push(topPt);
      bottom.push(botPt);
      hover.push({ pt: topPt, p });
    }
    drawSegment();

    this.renderMarkers(ctx, g, hover);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, hover, this.color);
  }
}
