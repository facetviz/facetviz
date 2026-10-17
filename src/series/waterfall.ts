/**
 * Waterfall series. Each point is a delta added to a running total, drawn as a
 * floating bar from the previous cumulative to the new one. Points flagged
 * `isSum` / `isIntermediateSum` draw an absolute bar from zero to the running
 * total; `isTotal` sets the running total to the point's own `y` (an opening
 * balance, or a known total part-way). Rises, falls and totals are coloured
 * distinctly (`upColor`, `downColor`, `sumColor`), with connector lines.
 * Data labels show each step's change (a sum's running total): `outside`
 * (default) beyond the bar's moving end, `inside`, `center` or `base`.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { CategoryScale } from '../core/scale.js';
import { drawDataLabel, labelString, type LabelPlacement } from './data-label.js';

/** Waterfall's point-level fields. */
export interface WaterfallPointOptions {
  /** Treat this point as a (running) sum instead of a delta — draws an
   *  absolute bar from zero to the running total. */
  isSum?: boolean;
  isIntermediateSum?: boolean;
  /** An absolute total: the running total becomes this point's `y`, drawn
   *  from zero like a sum. Use it for a starting value, e.g.
   *  `[{ y: 233, isTotal: true }, -29.8, -6.1, { isSum: true }]`. */
  isTotal?: boolean;
}

/** Waterfall's series-level fields. */
export interface WaterfallSeriesOptions {
  /** Rises. Default `'#26a69a'`. */
  upColor?: string;
  /** Falls. Default `'#ef5350'`. */
  downColor?: string;
  /** Sums and totals. Default `'#4472c4'`. */
  sumColor?: string;
}

const DEFAULT_COLORS = { up: '#26a69a', down: '#ef5350', sum: '#4472c4' };

export class WaterfallSeries extends BaseSeries {
  private get colors() {
    const o = this.options as WaterfallSeriesOptions;
    return { up: o.upColor ?? DEFAULT_COLORS.up, down: o.downColor ?? DEFAULT_COLORS.down, sum: o.sumColor ?? DEFAULT_COLORS.sum };
  }

  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  /** Cumulative extent so the value axis fits every floating bar. */
  override valueExtent(): [number, number] {
    let cum = 0, min = 0, max = 0;
    for (const p of this.points) {
      if (p.options.isTotal) {
        cum = p.y ?? 0;
        min = Math.min(min, cum); max = Math.max(max, cum);
      } else if (p.options.isSum || p.options.isIntermediateSum) {
        min = Math.min(min, cum); max = Math.max(max, cum);
      } else {
        const prev = cum; cum += p.y ?? 0;
        min = Math.min(min, prev, cum); max = Math.max(max, prev, cum);
      }
    }
    return [min, max];
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, yScale } = ctx;
    const catScale = ctx.xScale as CategoryScale;
    const g = renderer.group({ class: `facet-series facet-waterfall ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const barW = band * 0.6;
    const zeroY = yScale.scale(0);
    const dl = this.options.dataLabels;
    const labels = !!dl?.enabled && !ctx.suppressDataLabels;

    let cum = 0;
    let prevEndX: number | null = null;
    let prevY = zeroY;

    const colors = this.colors;
    for (const p of this.points) {
      if (p.options.isTotal) cum = p.y ?? 0;
      const isSum = !!(p.options.isSum || p.options.isIntermediateSum || p.options.isTotal);
      const from = isSum ? 0 : cum;
      const to = isSum ? cum : cum + (p.y ?? 0);
      if (!isSum) cum = to;

      const cx = catScale.scale(p.x);
      const x0 = cx - barW / 2;
      const yTop = yScale.scale(Math.max(from, to));
      const yBot = yScale.scale(Math.min(from, to));
      const color = p.color ?? (isSum ? colors.sum : to >= from ? colors.up : colors.down);

      // Connector from the previous bar's end level.
      if (prevEndX !== null) {
        renderer.create('line', { x1: prevEndX, y1: prevY, x2: x0, y2: prevY, stroke: '#b0b0b0', 'stroke-width': 1, 'stroke-dasharray': '2 2' }, g);
      }

      const el = renderer.create('rect', {
        x: x0, y: yTop, width: barW, height: Math.max(1, yBot - yTop),
        fill: color, class: 'facet-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      if (labels) {
        const value = isSum ? cum : (p.y ?? 0);
        const text = labelString(dl!, {
          x: p.x, y: value, point: p.options, series: this.name,
          name: p.name ?? p.x, index: p.index, color,
        });
        // Falls hang below their bar; rises and sums sit on top.
        const down = to < from;
        const d = dl!.distance ?? 0;
        const pos = dl!.position ?? 'outside';
        let place: LabelPlacement;
        if (pos === 'center') place = { x: cx, y: (yTop + yBot) / 2, anchor: 'middle', verticalAlign: 'middle' };
        else if (pos === 'inside') place = down ? { x: cx, y: yBot - 5 - d, anchor: 'middle' } : { x: cx, y: yTop + 12 + d, anchor: 'middle', side: 'down' };
        else if (pos === 'base') place = down ? { x: cx, y: yTop + 12 + d, anchor: 'middle', side: 'down' } : { x: cx, y: yBot - 5 - d, anchor: 'middle' };
        else place = down ? { x: cx, y: yBot + 4 + d, anchor: 'middle', verticalAlign: 'hanging' } : { x: cx, y: yTop - 4 - d, anchor: 'middle' };
        drawDataLabel(renderer, g, text, place, dl!);
      }

      prevEndX = x0 + barW;
      prevY = yScale.scale(to);
    }
  }
}
