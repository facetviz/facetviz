/**
 * Funnel series. Stages are stacked trapezoids whose width is proportional to
 * their value, narrowing towards the next stage. Self-contained (non-cartesian);
 * each stage shows its name and value centred inside.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, textOn } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { cellLabelAttrs, dataLabelFontSize } from './data-label.js';

export class FunnelSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-funnel ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;

    // A stage's width is its share of the widest; a zero, negative or
    // missing value has no width (it can't be drawn flipped).
    const size = (v: number | null | undefined) => Math.max(0, v ?? 0);
    const max = Math.max(...points.map((p) => size(p.y))) || 1;
    const maxW = plot.width * 0.66;
    const cx = plot.x + plot.width / 2;
    const gap = 2;
    const stageH = (plot.height - gap * (points.length - 1)) / points.length;
    const w = (v: number | null | undefined) => (size(v) / max) * maxW;
    const textColor = textOn(ctx.background ?? '#ffffff');

    points.forEach((p, i) => {
      const yTop = plot.y + i * (stageH + gap);
      const yBot = yTop + stageH;
      const topW = w(p.y);
      const botW = w(points[i + 1]?.y ?? p.y);
      const color = p.color ?? paletteColor(colors, i);
      const poly = `${cx - topW / 2},${yTop} ${cx + topW / 2},${yTop} ${cx + botW / 2},${yBot} ${cx - botW / 2},${yBot}`;

      const el = renderer.create('polygon', { points: poly, fill: color, stroke: ctx.background ?? '#ffffff', 'stroke-width': 1, class: 'facet-point' }, g);
      // `dataLabels.enabled: false` hides the stage labels; a `formatter`
      // writes the whole label (default "name: value").
      const dl = this.options.dataLabels;
      if (dl?.enabled !== false) {
        const lctx = { x: p.x ?? i, y: p.y ?? undefined, point: p.options, series: this.name, name: p.name, index: p.index, color };
        const text = dl?.formatter ? dl.formatter(lctx) : p.y == null ? String(p.name ?? p.x) : `${p.name ?? p.x}: ${p.y}`;
        // Inside the stage when it fits, else beside it in the text colour
        // (white on a sliver would vanish into the background).
        const base = { ...FONTS.dataLabel, 'font-weight': '600' };
        const narrowest = Math.min(topW, botW);
        const attrs = (fill: string) => ({ ...base, ...cellLabelAttrs(dl, fill, dataLabelFontSize(undefined), lctx) });
        const inside = attrs(textOn(color));
        const width = renderer.measureText(text, inside).width;
        const y = (yTop + yBot) / 2 + (dl?.offsetY || 0);
        if (width + 8 <= narrowest) {
          renderer.text(text, cx + (dl?.offsetX || 0), y, { 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...inside }, g);
        } else {
          renderer.text(text, cx + Math.max(topW, botW) / 2 + 6 + (dl?.offsetX || 0), y, {
            'text-anchor': 'start', 'dominant-baseline': 'middle', ...attrs(textColor),
          }, g);
        }
      }

      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    });
  }
}
