/**
 * Gauge (radial dial). Shows the first point's value on a 270° arc between
 * `min` and `max` (series options, default 0–100), with an optional coloured
 * band track, a needle and a numeric readout. Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { FONTS } from '../core/defaults.js';
import { THEME } from '../core/theme.js';

const START = 135; // degrees (SVG: 0 = east, clockwise); 270° sweep to 45°
const SWEEP = 270;

export class GaugeSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-gauge ${this.name}` }, renderer.root);
    const p = this.points[0];
    if (!p) return;

    const min = (this.options.min as number) ?? 0;
    const max = (this.options.max as number) ?? 100;
    const value = p.y ?? 0;
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

    const cx = plot.x + plot.width / 2;
    // Push the dial down and size the radius from the space above the centre so
    // the top of the arc never collides with the chart title.
    const cy = plot.y + plot.height * 0.62;
    const r = Math.min(plot.width * 0.44, plot.height * 0.5) - 6;
    const thickness = Math.max(10, r * 0.16);

    // Track.
    renderer.create('path', { d: this.arc(cx, cy, r, START, START + SWEEP), fill: 'none', stroke: THEME.axis.gridLineColor, 'stroke-width': thickness, 'stroke-linecap': 'round' }, g);

    // Coloured bands, or a single value arc.
    const bands = this.options.bands as Array<{ from: number; to: number; color: string }> | undefined;
    if (bands) {
      for (const b of bands) {
        const a0 = START + SWEEP * ((b.from - min) / (max - min || 1));
        const a1 = START + SWEEP * ((b.to - min) / (max - min || 1));
        renderer.create('path', { d: this.arc(cx, cy, r, a0, a1), fill: 'none', stroke: b.color, 'stroke-width': thickness, 'stroke-linecap': 'butt' }, g);
      }
    } else {
      renderer.create('path', { d: this.arc(cx, cy, r, START, START + SWEEP * frac), fill: 'none', stroke: p.color ?? this.color, 'stroke-width': thickness, 'stroke-linecap': 'round' }, g);
    }

    // Needle + hub.
    const ang = ((START + SWEEP * frac) * Math.PI) / 180;
    const nr = r - thickness / 2;
    const needle = renderer.create('line', {
      x1: cx, y1: cy, x2: cx + nr * Math.cos(ang), y2: cy + nr * Math.sin(ang),
      stroke: '#333', 'stroke-width': 3, 'stroke-linecap': 'round', class: 'facet-point',
    }, g);
    renderer.create('circle', { cx, cy, r: 6, fill: '#333' }, g);

    // Readout.
    renderer.text(String(value), cx, cy + r * 0.5, { 'text-anchor': 'middle', ...FONTS.title, 'font-size': '22px' }, g);
    if (p.name ?? this.name) {
      renderer.text(String(p.name ?? this.name), cx, cy + r * 0.5 + 18, { 'text-anchor': 'middle', ...FONTS.subtitle }, g);
    }

    ctx.registerHover(needle, p);
    needle.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
  }

  /** SVG arc path from startDeg to endDeg on a circle. */
  private arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const p0 = this.pt(cx, cy, r, a0);
    const p1 = this.pt(cx, cy, r, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
  }

  private pt(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
}
