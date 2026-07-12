/**
 * Funnel series. Stages are stacked trapezoids whose width is proportional to
 * their value, narrowing towards the next stage. Self-contained (non-cartesian);
 * each stage shows its name and value centred inside.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';

export class FunnelSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-funnel ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;

    const max = Math.max(...points.map((p) => p.y ?? 0)) || 1;
    const maxW = plot.width * 0.66;
    const cx = plot.x + plot.width / 2;
    const gap = 2;
    const stageH = (plot.height - gap * (points.length - 1)) / points.length;
    const w = (v: number) => (v / max) * maxW;

    points.forEach((p, i) => {
      const yTop = plot.y + i * (stageH + gap);
      const yBot = yTop + stageH;
      const topW = w(p.y ?? 0);
      const botW = w(points[i + 1]?.y ?? p.y ?? 0);
      const color = p.color ?? paletteColor(colors, i);
      const poly = `${cx - topW / 2},${yTop} ${cx + topW / 2},${yTop} ${cx + botW / 2},${yBot} ${cx - botW / 2},${yBot}`;

      const el = renderer.create('polygon', { points: poly, fill: color, stroke: '#ffffff', 'stroke-width': 1, class: 'facet-point' }, g);
      renderer.text(`${p.name ?? p.x}: ${p.y}`, cx, (yTop + yBot) / 2, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel, fill: '#ffffff', 'font-weight': '600',
      }, g);

      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    });
  }
}
