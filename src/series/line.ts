/** Line-family series: line, spline and step. Optionally shows markers. */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { Point } from '../core/point.js';
import { linePath, splinePath, stepPath, Pt } from './paths.js';
import { drawMarker } from './marker.js';
import { drawPointLabels } from './data-label.js';
import { polarPoint } from "./polar.js";

let blendGradientId = 0;

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
    const opacity = this.options.opacity;
    const g = renderer.group(
      {
        class: `facet-series facet-line ${this.name}`,
        ...(typeof opacity === 'number' && Number.isFinite(opacity) ? { opacity: Math.min(1, Math.max(0, opacity)) } : {}),
      },
      renderer.root,
    );
    const segments = this.pixelSegments(ctx);
    const data = segments.flat();
    if (this.options.blendPointColors === true && !ctx.polar) {
      this.renderBlended(ctx, g, segments);
      this.renderMarkers(ctx, g, data);
      drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, data, this.color);
      return;
    }
    for (const segment of segments) {
      const points =
        ctx.polar && !ctx.inverted && segments.length === 1 && segment.length > 2
          ? [...segment.map((d) => d.pt), segment[0].pt]
          : segment.map((d) => d.pt);
      renderer.create('path', {
        d: this.buildPath(points),
        fill: 'none',
        stroke: this.color,
        'stroke-width': this.options.lineWidth ?? this.options.size ?? 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        ...(this.options.dashStyle ? { 'stroke-dasharray': this.options.dashStyle } : {}),
      }, g);
    }

    this.renderMarkers(ctx, g, data);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, data, this.color);
  }

  /**
   * Straight segments, each shading from its start point's color to its end
   * point's (points without a color use the series color).
   */
  private renderBlended(ctx: SeriesRenderContext, g: SVGGElement, segments: Array<Array<{ pt: Pt; p: Point }>>): void {
    const { renderer } = ctx;
    let defs: SVGElement | null = null;
    const width = this.options.lineWidth ?? this.options.size ?? 2;
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1];
        const b = segment[i];
        const from = a.p.color ?? this.color;
        const to = b.p.color ?? this.color;
        let stroke = from;
        if (from !== to) {
          defs ??= renderer.create('defs', {}, g);
          const id = `facet-line-blend-${++blendGradientId}`;
          const gradient = renderer.create(
            'linearGradient',
            { id, gradientUnits: 'userSpaceOnUse', x1: a.pt.x, y1: a.pt.y, x2: b.pt.x, y2: b.pt.y },
            defs,
          );
          renderer.create('stop', { offset: 0, 'stop-color': from }, gradient);
          renderer.create('stop', { offset: 1, 'stop-color': to }, gradient);
          stroke = `url(#${id})`;
        }
        renderer.create('path', {
          d: linePath([a.pt, b.pt]),
          fill: 'none',
          stroke,
          'stroke-width': width,
          'stroke-linecap': 'round',
          ...(this.options.dashStyle ? { 'stroke-dasharray': this.options.dashStyle } : {}),
        }, g);
      }
    }
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
          // A point's own color wins, as for every other point-colored mark.
          fill: p.color ?? marker!.fillColor ?? this.color,
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
