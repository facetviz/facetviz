/** Line-family series: line, spline and step. Optionally shows markers. */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { Point } from '../core/point.js';
import { linePath, splinePath, stepPath, Pt } from './paths.js';
import { drawMarker } from './marker.js';
import { drawPointLabels } from './data-label.js';
import { polarPoint } from "./polar.js";

export class LineSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: true };
  }

  /** Preserve null values as path breaks instead of joining across them. */
  protected pixelSegments(ctx: SeriesRenderContext): Array<Array<{ pt: Pt; p: Point }>> {
    const segments: Array<Array<{ pt: Pt; p: Point }>> = [];
    let current: Array<{ pt: Pt; p: Point }> = [];
    // `chart.inverted` swaps which scale carries the category vs. the
    // value axis (same convention as ColumnSeries.render) -- ctx.xScale/
    // yScale are already the pre-swapped pair the chart builds for this
    // case, so picking by role here (not by x/y) keeps this correct under
    // both orientations.
    const catScale = ctx.inverted ? ctx.yScale : ctx.xScale;
    const valScale = ctx.inverted ? ctx.xScale : ctx.yScale;
    for (const p of this.points) {
      const y = p.stackHigh !== undefined ? p.stackHigh : p.y;
      if (y === undefined) {
        if (current.length) segments.push(current);
        current = [];
        continue;
      }
      if (ctx.polar) {
        current.push({ pt: polarPoint(ctx, p.x, y), p });
        continue;
      }
      const catPx = catScale.scale(p.x);
      const valPx = valScale.scale(y);
      current.push({
        pt: ctx.inverted ? { x: valPx, y: catPx } : { x: catPx, y: valPx },
        p,
      });
    }
    if (current.length) segments.push(current);
    return segments;
  }

  protected pixelPoints(ctx: SeriesRenderContext): Array<{ pt: Pt; p: Point }> {
    return this.pixelSegments(ctx).flat();
  }

  protected buildPath(pts: Pt[]): string {
    switch (this.type) {
      case 'spline':
        return splinePath(pts);
      case 'step':
        return stepPath(pts);
      default:
        return linePath(pts);
    }
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer } = ctx;
    const g = renderer.group({ class: `facet-series facet-line ${this.name}` }, renderer.root);
    const segments = this.pixelSegments(ctx);
    const data = segments.flat();
    for (const segment of segments) {
      const points =
        ctx.polar && segments.length === 1 && segment.length > 2
          ? [...segment.map((d) => d.pt), segment[0].pt]
          : segment.map((d) => d.pt);
      renderer.create('path', {
        d: this.buildPath(points),
        fill: 'none',
        stroke: this.color,
        'stroke-width': this.options.lineWidth ?? this.options.size ?? 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }, g);
    }

    this.renderMarkers(ctx, g, data);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, data, this.color);
  }

  protected renderMarkers(
    ctx: SeriesRenderContext,
    g: SVGGElement,
    data: Array<{ pt: Pt; p: Point }>,
  ): void {
    const marker = this.options.marker;
    const visible = marker?.enabled === true;
    for (const { pt, p } of data) {
      let el: SVGElement;
      if (visible) {
        el = drawMarker(ctx.renderer, g, pt.x, pt.y, {
          symbol: marker!.symbol ?? 'circle',
          radius: marker!.radius ?? 4,
          fill: marker!.fillColor ?? this.color,
          stroke: marker!.lineColor ?? '#fff',
          strokeWidth: marker!.lineWidth ?? 1,
          width: marker!.width,
          height: marker!.height,
        });
      } else {
        // Invisible hit target so tooltips/events work even without markers
        // (e.g. plain line and stacked area charts).
        el = ctx.renderer.create('circle', {
          cx: pt.x, cy: pt.y, r: 8, fill: 'transparent',
          'pointer-events': 'all', class: 'facet-point-hit',
        }, g);
      }
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }
  }
}
