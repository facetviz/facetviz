/**
 * Boxplot series. Each point carries a five-number summary
 * (min, q1, median, q3, max) — provided directly or computed from a raw array
 * via {@link computeBoxStats}.
 *
 * Orientation follows the chart: vertical by default (category on x, value on y)
 * or horizontal when `chart.inverted` is set. Multiple boxplot series group
 * side-by-side within each category band.
 *
 * Rendered with a dual-colour interquartile box: the lower half
 * (q1→median) and upper half (median→q3) use two shades of the series colour so
 * the median split reads clearly.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale, Scale } from '../core/scale.js';
import { shade } from '../core/colors.js';
import { THEME } from '../core/theme.js';
import { drawMarker } from './marker.js';
import type { Point } from '../core/point.js';

export class BoxplotSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    if (!p.box) return [p.low, p.high];
    // Outliers can sit well beyond the whiskers — include them so the value
    // axis auto-scales to fit every marker, not just the five-number summary.
    return [p.box.min, p.box.max, ...(p.box.outliers ?? [])];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    // Category axis / value axis swap when the chart is inverted (horizontal).
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale: Scale = inverted ? ctx.xScale : ctx.yScale;
    const layer = renderer.group({ class: `facet-series facet-boxplot ${this.name}` }, renderer.root);

    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    const boxWidth = subWidth * 0.7;
    const half = boxWidth / 2;
    const v = (val: number) => valScale.scale(val);

    for (const p of this.points) {
      const box = p.box;
      if (!box) continue;
      const base = p.color ?? this.color;
      // Dual colour: user hues, or two shades of the series colour by default.
      const bc = this.options.boxColors ?? {};
      const upperFill = bc.upper ?? shade(base, 0.15);
      const lowerFill = bc.lower ?? shade(base, 0.5);
      const stroke = bc.border ?? shade(base, -0.25);
      const whisker = bc.whisker ?? stroke;
      const medianColor = bc.median ?? stroke;

      const c = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth; // centre along category axis
      const lo = c - half;

      // Orientation helpers: a line along the value axis, a perpendicular cap,
      // a box rect between two values, and the median line.
      const valLine = (a: number, b: number) => inverted
        ? { x1: v(a), y1: c, x2: v(b), y2: c }
        : { x1: c, y1: v(a), x2: c, y2: v(b) };
      const cap = (val: number, len: number) => inverted
        ? { x1: v(val), y1: c - len, x2: v(val), y2: c + len }
        : { x1: c - len, y1: v(val), x2: c + len, y2: v(val) };
      const boxRect = (a: number, b: number) => {
        const va = v(a), vb = v(b);
        return inverted
          ? { x: Math.min(va, vb), y: lo, width: Math.max(1, Math.abs(vb - va)), height: boxWidth }
          : { x: lo, y: Math.min(va, vb), width: boxWidth, height: Math.max(1, Math.abs(vb - va)) };
      };
      const medLine = () => inverted
        ? { x1: v(box.median), y1: lo, x2: v(box.median), y2: lo + boxWidth }
        : { x1: lo, y1: v(box.median), x2: lo + boxWidth, y2: v(box.median) };

      const g = renderer.group({ class: 'facet-point' }, layer);

      // Whiskers + end caps.
      renderer.create('line', { ...valLine(box.min, box.q1), stroke: whisker, 'stroke-width': 1 }, g);
      renderer.create('line', { ...valLine(box.q3, box.max), stroke: whisker, 'stroke-width': 1 }, g);
      renderer.create('line', { ...cap(box.min, half * 0.7), stroke: whisker }, g);
      renderer.create('line', { ...cap(box.max, half * 0.7), stroke: whisker }, g);

      // Interquartile box split at the median into two shades.
      renderer.create('rect', { ...boxRect(box.median, box.q3), fill: upperFill, stroke, 'stroke-width': 1 }, g);
      renderer.create('rect', { ...boxRect(box.q1, box.median), fill: lowerFill, stroke, 'stroke-width': 1 }, g);

      // Median line.
      renderer.create('line', { ...medLine(), stroke: medianColor, 'stroke-width': 2 }, g);

      // Outliers — drawn at this box's own centre `c` (already offset for
      // groupIndex within the category band), so a grouped boxplot keeps
      // each series' outliers stacked above/below its own box instead of
      // drifting to the shared category centre.
      const om = this.options.outlierMarker ?? {};
      const outlierR = om.radius ?? Math.min(4, half * 0.5);
      for (const val of box.outliers ?? []) {
        const pos = v(val);
        const oc = inverted ? { x: pos, y: c } : { x: c, y: pos };
        drawMarker(renderer, g, oc.x, oc.y, {
          symbol: om.symbol ?? 'circle',
          radius: outlierR,
          fill: om.fillColor ?? THEME.backgroundColor,
          stroke: om.lineColor ?? stroke,
          strokeWidth: om.lineWidth ?? 1.5,
        });
      }

      ctx.registerHover(g, p);
      g.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      g.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      g.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }
  }
}

/** Compute a five-number summary from raw values (linear interpolation). */
export function computeBoxStats(values: number[]): {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
} {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = p * (s.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[s.length - 1] };
}
