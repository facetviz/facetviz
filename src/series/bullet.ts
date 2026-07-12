/**
 * Bullet chart. One horizontal row per point showing a measure bar against
 * qualitative background bands (`ranges`) and a comparative `target` marker.
 * Self-contained (non-cartesian): draws its own row labels and value ticks.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { FONTS } from '../core/defaults.js';
import { THEME } from '../core/theme.js';

export class BulletSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-bullet ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;

    const labelW = 8 + points.reduce((m, p) => Math.max(m, String(p.name ?? p.x).length), 0) * 6.6;
    const gx = plot.x + labelW;
    const gw = plot.width - labelW - 12;
    const rowH = plot.height / points.length;
    const bandShades = ['#e6e6e6', '#d0d0d0', '#bcbcbc', '#a8a8a8'];

    points.forEach((p, i) => {
      const ranges = (p.options.ranges as number[]) ?? [];
      const target = p.options.target as number | undefined;
      const value = p.y ?? 0;
      const max = Math.max(value, target ?? 0, ...ranges) || 1;
      const sx = (v: number) => gx + (v / max) * gw;
      const cy = plot.y + i * rowH + rowH / 2;
      const h = Math.min(rowH * 0.6, 34);

      // Qualitative bands, largest (lightest) drawn first.
      [...ranges].map((v, idx) => ({ v, idx })).sort((a, b) => b.v - a.v).forEach(({ v, idx }) => {
        renderer.create('rect', { x: gx, y: cy - h / 2, width: sx(v) - gx, height: h, fill: bandShades[idx % bandShades.length] }, g);
      });
      // Measure bar.
      const el = renderer.create('rect', { x: gx, y: cy - h / 5, width: sx(value) - gx, height: (h * 2) / 5, fill: p.color ?? this.color, class: 'facet-point' }, g);
      // Target marker.
      if (typeof target === 'number') {
        renderer.create('line', { x1: sx(target), y1: cy - h / 2, x2: sx(target), y2: cy + h / 2, stroke: '#333', 'stroke-width': 2.5 }, g);
      }
      // Row label.
      renderer.text(String(p.name ?? p.x), gx - 6, cy, { 'text-anchor': 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel }, g);

      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    });

    renderer.create('line', { x1: gx, y1: plot.y, x2: gx, y2: plot.y + plot.height, stroke: THEME.axis.lineColor }, g);
  }
}
