/**
 * Calendar heatmap — a GitHub-contributions-style grid. Each point is
 * `{ date, value }`; days are laid out in week columns × weekday rows and
 * coloured along a sequential scale. Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { lerpColor } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { THEME } from '../core/theme.js';

/** Calendar's point-level fields — a day (ms timestamp, Date, or ISO string)
 *  plus the shared `value` cell measure (also used by heatmap/sunburst). */
export interface CalendarPointOptions {
  date?: number | string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;

export class CalendarSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-calendar ${this.name}` }, renderer.root);

    const days = this.points
      .map((p) => ({ date: new Date(p.options.date ?? p.x), value: p.options.value ?? p.y ?? 0, point: p }))
      .filter((d) => !Number.isNaN(d.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!days.length) return;

    const values = days.map((d) => d.value);
    const min = Math.min(...values), max = Math.max(...values);
    const first = days[0].date;
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    // Compare local calendar dates through UTC day ordinals. This preserves
    // local weekdays without treating a daylight-saving week as 167/169h.
    const dayOrdinal = (d: Date) =>
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
    const startDay = dayOrdinal(start);
    const weekIndex = (d: Date) => Math.floor((dayOrdinal(d) - startDay) / 7);

    const topPad = 16, leftPad = 26;
    const weeks = weekIndex(days[days.length - 1].date) + 1;
    const cell = Math.min((plot.width - leftPad) / weeks, (plot.height - topPad) / 7) - 2;
    const step = cell + 2;
    // Centre the grid horizontally so it isn't stranded on the left when the
    // cell size is limited by height (7 weekday rows).
    const gridW = weeks * step;
    const gx = plot.x + leftPad + Math.max(0, (plot.width - leftPad - gridW) / 2);
    const gy = plot.y + topPad;

    // Weekday labels (Mon/Wed/Fri).
    ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach((lbl, i) => {
      if (lbl) renderer.text(lbl, gx - 5, gy + i * step + cell / 2, { 'text-anchor': 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel, 'font-size': '9px' }, g);
    });

    let lastMonth = -1;
    for (const d of days) {
      const wk = weekIndex(d.date);
      const wd = d.date.getDay();
      const x = gx + wk * step, y = gy + wd * step;
      const t = max === min ? 0.5 : (d.value - min) / (max - min);
      const el = renderer.create('rect', {
        x, y, width: cell, height: cell, rx: 2,
        fill: d.point.color ?? lerpColor('#eaf3fb', this.color, t), stroke: THEME.axis.gridLineColor, 'stroke-width': 0.5, class: 'facet-point',
      }, g);
      ctx.registerHover(el, d.point);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', d.point, e));
      // Month label at each month's first appearance.
      if (d.date.getMonth() !== lastMonth) {
        lastMonth = d.date.getMonth();
        renderer.text(MONTHS[lastMonth], x, plot.y + 9, { 'text-anchor': 'start', ...FONTS.axisLabel, 'font-size': '9px' }, g);
      }
    }
  }
}
