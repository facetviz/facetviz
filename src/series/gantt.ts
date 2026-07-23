/**
 * Gantt — one horizontal duration bar per task row, spanning `start`→`end`
 * (millisecond timestamps or plain numbers). Draws its own task labels and a
 * linear time axis. Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { THEME } from '../core/theme.js';
import { formatDate } from '../core/utils.js';

/** Gantt's point-level fields — task duration (ms timestamps or plain
 *  numbers). Falls back to the shared `low`/`high` pair when omitted. */
export interface GanttPointOptions {
  start?: number;
  end?: number;
}

export class GanttSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-gantt ${this.name}` }, renderer.root);

    const tasks = this.points
      .map((p) => ({ name: String(p.name ?? p.x), start: p.options.start ?? p.low ?? 0, end: p.options.end ?? p.high ?? 0, point: p }))
      .filter((t) => t.end > t.start);
    if (!tasks.length) return;

    const min = Math.min(...tasks.map((t) => t.start));
    const max = Math.max(...tasks.map((t) => t.end));
    const isTime = min > 1e11;
    const labelW = 8 + tasks.reduce((m, t) => Math.max(m, t.name.length), 0) * 6.4;
    const gx = plot.x + labelW, gw = plot.width - labelW - 8;
    const bottomPad = 22, gh = plot.height - bottomPad;
    const sx = (v: number) => gx + ((v - min) / (max - min || 1)) * gw;
    const rowH = gh / tasks.length;

    tasks.forEach((t, i) => {
      const y = plot.y + i * rowH;
      const h = Math.min(rowH * 0.6, 26);
      const bar = renderer.create('rect', {
        x: sx(t.start), y: y + (rowH - h) / 2, width: Math.max(2, sx(t.end) - sx(t.start)), height: h, rx: 4,
        fill: t.point.color ?? paletteColor(colors, i), class: 'facet-point',
      }, g);
      ctx.registerHover(bar, t.point);
      bar.addEventListener('click', (e: Event) => ctx.onPointEvent('click', t.point, e));
      bar.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', t.point, e));
      bar.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', t.point, e));
      renderer.text(t.name, gx - 6, y + rowH / 2, { 'text-anchor': 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel }, g);
    });

    // Time axis.
    const baseY = plot.y + gh;
    renderer.create('line', { x1: gx, y1: baseY, x2: gx + gw, y2: baseY, stroke: THEME.axis.lineColor }, g);
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = min + ((max - min) * i) / ticks;
      const x = sx(v);
      renderer.create('line', { x1: x, y1: baseY, x2: x, y2: baseY + 4, stroke: THEME.axis.lineColor }, g);
      const label = isTime ? formatDate(v, '%b %d') : String(Math.round(v));
      renderer.text(label, x, baseY + 14, { 'text-anchor': 'middle', ...FONTS.axisLabel }, g);
    }
  }
}
