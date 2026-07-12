/**
 * Dumbbell series. For each category a connector line joins a `low` and a
 * `high` value, with a coloured marker at each end — ideal for showing the
 * change or gap between two measures (before/after, min/max, etc.).
 *
 * Vertical orientation: category on x, value on y. Multiple dumbbell series are
 * placed side-by-side within each category band (grouped).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale, Scale } from '../core/scale.js';
import { drawMarker } from './marker.js';
import { drawDataLabel, labelString, LabelPlacement } from './data-label.js';
import { THEME } from '../core/theme.js';
import type { Point } from '../core/point.js';

export class DumbbellSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    return [p.low, p.high];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    // Horizontal (inverted): category on y, value on x. Vertical: the reverse.
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group({ class: `facet-series facet-dumbbell ${this.name}` }, renderer.root);

    const band = catScale.bandwidth ? catScale.bandwidth() : 0;
    const subWidth = band / groupCount;
    const radius = this.options.marker?.radius ?? 5;
    const lowColor = this.options.lowColor ?? this.color;
    const highColor = this.options.highColor ?? this.color;
    const connColor = this.options.connectorColor ?? THEME.neutralColor;
    const connWidth = this.options.connectorWidth ?? 3;

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vLow = valScale.scale(p.low);
      const vHigh = valScale.scale(p.high);

      // Connector (along the value axis).
      const conn = inverted
        ? { x1: vLow, y1: cat, x2: vHigh, y2: cat }
        : { x1: cat, y1: vLow, x2: cat, y2: vHigh };
      renderer.create('line', {
        ...conn, stroke: connColor, 'stroke-width': connWidth, 'stroke-linecap': 'round',
      }, g);

      // End markers (both hoverable).
      for (const [v, color] of [[vLow, lowColor], [vHigh, highColor]] as const) {
        const cx = inverted ? (v as number) : cat;
        const cy = inverted ? cat : (v as number);
        const el = drawMarker(renderer, g, cx, cy, {
          symbol: this.options.marker?.symbol ?? 'circle',
          radius, fill: color as string, stroke: '#fff', strokeWidth: 1.5,
        });
        ctx.registerHover(el, p);
        el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
        el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
        el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
      }

      this.drawEndLabels(ctx, p, cat, valScale, inverted, radius);
    }
  }

  /** Labels at the low and high ends (both values shown by default). */
  private drawEndLabels(
    ctx: SeriesRenderContext, p: Point, cat: number, valScale: Scale,
    inverted: boolean, radius: number,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const ends: Array<{ val: number; isHigh: boolean }> = [
      { val: p.low!, isHigh: false },
      { val: p.high!, isHigh: true },
    ];
    for (const end of ends) {
      const v = valScale.scale(end.val);
      const text = labelString(dl, {
        x: p.x, y: end.val, low: p.low, high: p.high, point: p.options,
        series: this.name, name: p.name ?? p.x, index: p.index, color: p.color ?? this.color,
      });
      const d = dl.distance ?? 0;
      let place: LabelPlacement;
      if (inverted) {
        place = end.isHigh
          ? { x: v + radius + 6 + d, y: cat + 4, anchor: 'start' }
          : { x: v - radius - 6 - d, y: cat + 4, anchor: 'end' };
      } else {
        place = end.isHigh
          ? { x: cat, y: v - radius - 6 - d, anchor: 'middle' }
          : { x: cat, y: v + radius + 14 + d, anchor: 'middle' };
      }
      drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
}
