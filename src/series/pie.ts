/**
 * Pie / donut series. Ignores the cartesian axes and instead lays slices out
 * around the plot-area centre. `donut` (or an `innerSize`) carves a hole.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { formatString, sum } from '../core/utils.js';
import type { Point } from '../core/point.js';

export class PieSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  private innerRatio(): number {
    if (this.type === 'donut') {
      return this.parsePercent(this.options.innerSize ?? '60%');
    }
    return this.options.innerSize ? this.parsePercent(this.options.innerSize) : 0;
  }

  private parsePercent(v: string): number {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : Math.min(0.95, Math.max(0, n / 100));
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `jchart-series jchart-pie ${this.name}` }, renderer.root);

    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const radius = Math.min(plot.width, plot.height) / 2 - 4;
    const innerR = radius * this.innerRatio();

    // Only draw visible slices; total is over visible points so hiding a slice
    // via the legend redistributes the remaining ones.
    const points = this.visiblePoints();
    const total = sum(points.map((p) => p.y ?? 0));
    if (total <= 0) return;

    let angle = -Math.PI / 2; // start at 12 o'clock
    points.forEach((p) => {
      const value = p.y ?? 0;
      if (value <= 0) return;
      const sweep = (value / total) * Math.PI * 2;
      const end = angle + sweep;
      const color = p.color ?? paletteColor(colors, this.points.indexOf(p));

      const path = this.slicePath(cx, cy, radius, innerR, angle, end);
      const el = renderer.create('path', { d: path, fill: color, stroke: '#ffffff', 'stroke-width': 1, class: 'jchart-point' }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      this.drawLabel(ctx, p, cx, cy, radius, (angle + end) / 2, value, total);
      angle = end;
    });
  }

  private slicePath(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);

    if (ir <= 0) {
      return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    }
    const ix0 = cx + ir * Math.cos(a1);
    const iy0 = cy + ir * Math.sin(a1);
    const ix1 = cx + ir * Math.cos(a0);
    const iy1 = cy + ir * Math.sin(a0);
    return (
      `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} ` +
      `L ${ix0} ${iy0} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`
    );
  }

  private drawLabel(
    ctx: SeriesRenderContext,
    p: Point,
    cx: number,
    cy: number,
    radius: number,
    mid: number,
    value: number,
    total: number,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const inside = dl.position === 'inside';
    // Inside: place along the mid-radius; outside (default): beyond the rim.
    const lr = inside ? radius * 0.62 : radius + 14 + (dl.distance ?? 0);
    const lx = cx + lr * Math.cos(mid);
    const ly = cy + lr * Math.sin(mid);
    const pct = ((value / total) * 100).toFixed(1);
    const text = dl.formatter
      ? dl.formatter({ x: p.x, y: p.y, point: p.options, series: this.name })
      : formatString(dl.format ?? '{name}: {percentage}%', {
          name: p.name ?? p.x,
          y: value,
          percentage: pct,
          point: p.options,
        });
    ctx.renderer.text(text, lx, ly, {
      'text-anchor': inside ? 'middle' : Math.cos(mid) >= 0 ? 'start' : 'end',
      'dominant-baseline': 'middle',
      ...FONTS.dataLabel,
      fill: dl.color ?? (inside ? '#fff' : FONTS.dataLabel.fill),
      ...(dl.fontSize ? { 'font-size': dl.fontSize } : {}),
    }, ctx.renderer.root);
  }
}
