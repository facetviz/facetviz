/** Line-family series: line, spline and step. Optionally shows markers. */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { Point } from '../core/point.js';
import { linePath, splinePath, stepPath, Pt } from './paths.js';
import { drawMarker } from './marker.js';
import { drawPointLabels } from './data-label.js';

export class LineSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: true };
  }

  protected pixelPoints(ctx: SeriesRenderContext): Array<{ pt: Pt; p: Point }> {
    const out: Array<{ pt: Pt; p: Point }> = [];
    for (const p of this.points) {
      const y = p.stackHigh !== undefined ? p.stackHigh : p.y;
      if (y === undefined) continue; // gap in the line
      out.push({ pt: { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(y) }, p });
    }
    return out;
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
    const g = renderer.group({ class: `jchart-series jchart-line ${this.name}` }, renderer.root);
    const data = this.pixelPoints(ctx);
    const pts = data.map((d) => d.pt);

    renderer.create('path', {
      d: this.buildPath(pts),
      fill: 'none',
      stroke: this.color,
      'stroke-width': this.options.lineWidth ?? 2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }, g);

    this.renderMarkers(ctx, g, data);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, data);
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
        });
      } else {
        // Invisible hit target so tooltips/events work even without markers
        // (e.g. plain line and stacked area charts).
        el = ctx.renderer.create('circle', {
          cx: pt.x, cy: pt.y, r: 8, fill: 'transparent',
          'pointer-events': 'all', class: 'jchart-point-hit',
        }, g);
      }
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }
  }
}
