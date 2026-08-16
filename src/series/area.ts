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
import { polarPoint } from "./polar.js";
import type { AreaFillColor, LinearGradientColor } from "../core/options.js";

let areaGradientId = 0;

function isLinearGradient(fill: AreaFillColor): fill is LinearGradientColor {
  return typeof fill !== "string" && !!fill.linearGradient;
}

function areaFill(ctx: SeriesRenderContext, fill: AreaFillColor): string {
  if (!isLinearGradient(fill)) return fill;

  const { renderer } = ctx;
  const id = `facet-area-gradient-${++areaGradientId}`;
  const defs = renderer.create("defs", {}, renderer.root);
  const spec = fill.linearGradient;
  const gradient = renderer.create(
    "linearGradient",
    {
      id,
      x1: spec.x1 ?? 0,
      y1: spec.y1 ?? 0,
      x2: spec.x2 ?? 0,
      y2: spec.y2 ?? 1,
      gradientUnits: spec.gradientUnits ?? "objectBoundingBox",
    },
    defs,
  );
  for (const [offset, color, opacity] of fill.stops) {
    renderer.create(
      "stop",
      {
        offset,
        "stop-color": color,
        "stop-opacity": opacity,
      },
      gradient,
    );
  }
  return `url(#${id})`;
}

export class AreaSeries extends LineSeries {
  private smooth(): boolean {
    return this.type === 'areaspline';
  }

  protected override buildPath(pts: Pt[]): string {
    return this.smooth() ? splinePath(pts) : linePath(pts);
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer } = ctx;
    const configuredFill = this.options.fillColor;
    const fill = configuredFill !== undefined
      ? areaFill(ctx, configuredFill)
      : alpha(this.color, this.options.fillOpacity ?? 0.35);
    const g = renderer.group({ class: `facet-series facet-area ${this.name}` }, renderer.root);

    let top: Pt[] = [];
    let bottom: Pt[] = [];
    const hover: Array<{ pt: Pt; p: Point }> = [];
    // `chart.inverted` swaps which scale carries the category vs. the
    // value axis (same convention as ColumnSeries.render / LineSeries).
    const catScale = ctx.polar
      ? ctx.xScale
      : ctx.inverted
        ? ctx.yScale
        : ctx.xScale;
    const valScale = ctx.polar
      ? ctx.yScale
      : ctx.inverted
        ? ctx.xScale
        : ctx.yScale;

    const drawSegment = () => {
      if (!top.length) return;
      const line = this.smooth() ? splinePath : linePath;
      const reversedBottom = [...bottom].reverse();
      const topD = line(top);
      const bottomD = line(reversedBottom).replace(/^M/, 'L');
      renderer.create('path', {
        d: `${topD} ${bottomD} Z`,
        fill,
        stroke: 'none',
      }, g);
      renderer.create('path', {
        d:
          ctx.polar && !ctx.inverted && top.length > 2
            ? line([...top, top[0]])
            : topD,
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
      const topPt = ctx.polar
        ? polarPoint(ctx, p.x, hi)
        : ctx.inverted
        ? { x: valScale.scale(hi), y: catPx }
        : { x: catPx, y: valScale.scale(hi) };
      const botPt = ctx.polar
        ? polarPoint(ctx, p.x, lo)
        : ctx.inverted
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
