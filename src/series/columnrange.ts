/**
 * Column range / bar range as a rounded "capsule": a thick line from `low` to
 * `high` with circular ends (like a dumbbell, but a single solid bar). Vertical
 * by default (category on x); horizontal when `chart.inverted` is set. Multiple
 * series group side-by-side within each category band.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale, Scale } from '../core/scale.js';
import { drawDataLabel, labelString, LabelPlacement } from './data-label.js';
import type { Point } from '../core/point.js';

export class ColumnRangeSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    return [p.low, p.high];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale: Scale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group({ class: `facet-series facet-columnrange ${this.name}` }, renderer.root);

    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    const thickness = Math.min(subWidth * 0.55, 26);

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vLow = valScale.scale(p.low);
      const vHigh = valScale.scale(p.high);
      const coords = inverted
        ? { x1: vLow, y1: cat, x2: vHigh, y2: cat }
        : { x1: cat, y1: vLow, x2: cat, y2: vHigh };

      const el = renderer.create('line', {
        ...coords, stroke: p.color ?? this.color,
        'stroke-width': thickness, 'stroke-linecap': 'round', class: 'facet-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      this.drawEndLabels(ctx, p, cat, vLow, vHigh, inverted, thickness / 2);
    }
  }

  /** Labels at the low and high ends of the capsule. */
  private drawEndLabels(
    ctx: SeriesRenderContext, p: Point, cat: number, vLow: number, vHigh: number,
    inverted: boolean, half: number,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const ends: Array<{ val: number; v: number; isHigh: boolean }> = [
      { val: p.low!, v: vLow, isHigh: false },
      { val: p.high!, v: vHigh, isHigh: true },
    ];
    for (const end of ends) {
      const text = labelString(dl, {
        x: p.x, y: end.val, low: p.low, high: p.high, point: p.options,
        series: this.name, name: p.name ?? p.x, index: p.index, color: p.color ?? this.color,
      });
      const d = (dl.distance ?? 0) + half + 4;
      let place: LabelPlacement;
      if (inverted) {
        place = end.isHigh
          ? { x: end.v + d, y: cat + 4, anchor: 'start' }
          : { x: end.v - d, y: cat + 4, anchor: 'end' };
      } else {
        place = end.isHigh
          ? { x: cat, y: end.v - d, anchor: 'middle' }
          : { x: cat, y: end.v + d + 10, anchor: 'middle' };
      }
      drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
}
