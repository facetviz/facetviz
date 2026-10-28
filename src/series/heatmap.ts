/**
 * Heatmap series. Each point has an `x` and `y` category plus a `value`; cells
 * are laid out on a category × category grid and coloured by value along a
 * sequential scale. Self-contained (non-cartesian): it draws its own row/column
 * labels within the plot rectangle.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { lerpColor, shade } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { THEME, scaledFontPx } from '../core/theme.js';

/** A heatmap's own options. */
export interface HeatmapSeriesOptions {
  /** Where the column labels go: under the grid (default) or above it. */
  columnLabels?: 'bottom' | 'top';
  /** false: no line between the grid and the column labels. */
  axisLine?: boolean;
}

export class HeatmapSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  private axisValues(field: 'x' | 'y'): string[] {
    const seen: string[] = [];
    for (const p of this.points) {
      const v = String((field === 'x' ? p.x : p.options.y) ?? '');
      if (!seen.includes(v)) seen.push(v);
    }
    return seen;
  }

  /** How the column labels fit their cells: straight, or angled at 45°
   * (then `depth` px deep, each cut to fit at most 40% of the chart's
   * height) with every `step`th drawn so neighbours don't touch. */
  private columnLabelFit(
    renderer: SeriesRenderContext['renderer'],
    cols: string[],
    cw: number,
    height: number,
  ): { angled: boolean; step: number; depth: number; text: (c: string) => string } {
    const width = (t: string) => renderer.measureText(t, FONTS.axisLabel).width;
    const widest = Math.max(...cols.map(width));
    if (widest <= cw - 4) return { angled: false, step: 1, depth: 0, text: (c) => c };
    // Angled text's lines sit a line height apart across the cells: about
    // 16 px for 11 px labels.
    const step = Math.max(1, Math.ceil(16 / Math.max(cw, 1)));
    const room = Math.max(24, height * 0.4) / Math.SQRT1_2;
    const text = (c: string) => {
      if (width(c) <= room) return c;
      let cut = c;
      while (cut.length > 1 && width(`${cut}…`) > room) cut = cut.slice(0, -1);
      return `${cut}…`;
    };
    const longest = Math.min(widest, room);
    return { angled: true, step, depth: Math.ceil(longest * Math.SQRT1_2) + 6, text };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-heatmap ${this.name}` }, renderer.root);

    const cols = this.axisValues('x');
    const rows = this.axisValues('y');
    if (!cols.length || !rows.length) return;

    const opts = this.options as HeatmapSeriesOptions;
    const top = opts.columnLabels === 'top';
    const leftPad = 8 + rows.reduce((m, r) => Math.max(m, r.length), 0) * 6.6;
    const gx = plot.x + leftPad;
    let gw = plot.width - leftPad - 8;
    // Column labels too wide for their cells are angled (45°), and when
    // even angled ones would touch, only every Nth is drawn.
    let fit = this.columnLabelFit(renderer, cols, gw / cols.length, plot.height);
    if (top && fit.angled) {
      // Above the grid they lean right, past the last column: room for that.
      gw = Math.max(gw / 2, gw - (fit.depth - 6));
      fit = this.columnLabelFit(renderer, cols, gw / cols.length, plot.height);
    }
    const cw = gw / cols.length;
    // Room for the column labels, under the grid or above it.
    const labelPad = fit.angled ? fit.depth + 12 : 22;
    const gy = plot.y + (top ? labelPad : 6);
    const gh = plot.height - labelPad - 6;
    const ch = gh / rows.length;

    const values = this.points.map((p) => (p.options.value as number) ?? p.y ?? 0);
    const min = Math.min(...values), max = Math.max(...values);
    const lo = '#eaf3fb';
    const hi = this.color;
    const colorFor = (v: number) => lerpColor(lo, hi, max === min ? 0.5 : (v - min) / (max - min));

    // Cells.
    for (const p of this.points) {
      const ci = cols.indexOf(String(p.x ?? ''));
      const ri = rows.indexOf(String(p.options.y ?? ''));
      if (ci < 0 || ri < 0) continue;
      const value = (p.options.value as number) ?? p.y ?? 0;
      const x = gx + ci * cw;
      const y = gy + ri * ch;
      const el = renderer.create('rect', {
        x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 2,
        fill: p.color ?? colorFor(value), class: 'facet-point',
      }, g);
      // Value label if the cell is roomy enough and the chart itself isn't
      // too small for data-style labels (see `Chart.suppressDataLabels`).
      // `dataLabels.enabled: false` hides them; a `formatter` writes them.
      const dl = this.options.dataLabels;
      if (dl?.enabled !== false && !ctx.suppressDataLabels && cw > 26 && ch > 16) {
        const text = dl?.formatter
          ? dl.formatter({ x: p.x ?? '', y: value, point: p.options, series: this.name, name: p.name, index: p.index, color: p.color ?? colorFor(value) })
          : String(value);
        renderer.text(text, x + cw / 2 + (dl?.offsetX || 0), y + ch / 2 + (dl?.offsetY || 0), {
          'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel,
          fill: (value - min) / (max - min || 1) > 0.6 ? '#fff' : shade(hi, -0.4), 'font-size': scaledFontPx(10),
          // The cell under it takes the hover and clicks, as a pie slice's label lets its slice.
          'pointer-events': 'none',
        }, g);
      }
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }

    // Column labels, under the grid or above it.
    cols.forEach((c, i) => {
      if (i % fit.step) return;
      const x = gx + i * cw + cw / 2;
      if (!fit.angled) {
        renderer.text(c, x, top ? gy - 8 : gy + gh + 14, { 'text-anchor': 'middle', ...FONTS.axisLabel }, g);
        return;
      }
      // Angled up and to the right, ending (above) or starting (below) at the cell.
      const y = top ? gy - 6 : gy + gh + 8;
      const el = renderer.text(fit.text(c), x, y, { 'text-anchor': top ? 'start' : 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel }, g);
      el.setAttribute('transform', `rotate(-45 ${x} ${y})`);
      if (fit.text(c) !== c) el.appendChild(renderer.create('title', {})).textContent = c;
    });
    // Row labels (left).
    rows.forEach((r, i) => {
      renderer.text(r, gx - 6, gy + i * ch + ch / 2, { 'text-anchor': 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel }, g);
    });
    // The line between the grid and the column labels.
    if (opts.axisLine !== false) {
      const ly = top ? gy : gy + gh;
      renderer.create('line', { x1: gx, y1: ly, x2: gx + gw, y2: ly, stroke: THEME.axis.lineColor, class: 'facet-heatmap-line' }, g);
    }
  }
}
