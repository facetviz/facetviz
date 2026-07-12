/**
 * Timeline series. Events are placed along a horizontal axis (in data order),
 * each a marker on the line with its label/description alternating above and
 * below to avoid collisions. Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { THEME } from '../core/theme.js';

export class TimelineSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-timeline ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;

    const cy = plot.y + plot.height / 2;
    const pad = 40;
    const span = plot.width - pad * 2;
    const step = points.length > 1 ? span / (points.length - 1) : 0;

    renderer.create('line', { x1: plot.x + pad, y1: cy, x2: plot.x + plot.width - pad, y2: cy, stroke: THEME.axis.lineColor, 'stroke-width': 2 }, g);

    points.forEach((p, i) => {
      const x = plot.x + pad + i * step;
      const above = i % 2 === 0;
      const color = p.color ?? paletteColor(colors, i);
      const stub = above ? -34 : 34;

      renderer.create('line', { x1: x, y1: cy, x2: x, y2: cy + stub, stroke: color, 'stroke-width': 1.5 }, g);
      const marker = renderer.create('circle', { cx: x, cy, r: 6, fill: color, stroke: '#fff', 'stroke-width': 2, class: 'facet-point' }, g);

      const ty = cy + stub + (above ? -6 : 16);
      renderer.text(String(p.x ?? p.name), x, ty, { 'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': '600', fill: color }, g);
      const desc = p.options.name ?? p.name;
      if (desc && String(desc) !== String(p.x)) {
        renderer.text(String(desc), x, ty + (above ? -13 : 13), { 'text-anchor': 'middle', ...FONTS.axisLabel }, g);
      }

      ctx.registerHover(marker, p);
      marker.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      marker.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      marker.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    });
  }
}
