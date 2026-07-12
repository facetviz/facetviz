/**
 * Heatmap series. Each point has an `x` and `y` category plus a `value`; cells
 * are laid out on a category × category grid and coloured by value along a
 * sequential scale. Self-contained (non-cartesian): it draws its own row/column
 * labels within the plot rectangle.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { lerpColor, shade } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { THEME } from '../core/theme.js';

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

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-heatmap ${this.name}` }, renderer.root);

    const cols = this.axisValues('x');
    const rows = this.axisValues('y');
    if (!cols.length || !rows.length) return;

    const leftPad = 8 + rows.reduce((m, r) => Math.max(m, r.length), 0) * 6.6;
    const bottomPad = 22;
    const gx = plot.x + leftPad;
    const gy = plot.y + 6;
    const gw = plot.width - leftPad - 8;
    const gh = plot.height - bottomPad - 6;
    const cw = gw / cols.length;
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
      // Value label if the cell is roomy enough.
      if (cw > 26 && ch > 16) {
        renderer.text(String(value), x + cw / 2, y + ch / 2, {
          'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel,
          fill: (value - min) / (max - min || 1) > 0.6 ? '#fff' : shade(hi, -0.4), 'font-size': '10px',
        }, g);
      }
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    }

    // Column labels (bottom).
    cols.forEach((c, i) => {
      renderer.text(c, gx + i * cw + cw / 2, gy + gh + 14, { 'text-anchor': 'middle', ...FONTS.axisLabel }, g);
    });
    // Row labels (left).
    rows.forEach((r, i) => {
      renderer.text(r, gx - 6, gy + i * ch + ch / 2, { 'text-anchor': 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel }, g);
    });
    renderer.create('line', { x1: gx, y1: gy + gh, x2: gx + gw, y2: gy + gh, stroke: THEME.axis.lineColor }, g);
  }
}
