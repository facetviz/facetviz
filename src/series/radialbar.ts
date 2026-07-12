/**
 * Radial bar series. Each point becomes a concentric ring whose arc length is
 * proportional to its value (the familiar "activity rings" look). Polar, so it
 * ignores the cartesian axes and lays out from the plot centre.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, alpha } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';

export class RadialBarSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-radialbar ${this.name}` }, renderer.root);

    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const outer = Math.min(plot.width, plot.height) / 2 - 4;

    const points = this.visiblePoints();
    const max = Math.max(1, ...points.map((p) => p.y ?? 0));
    const n = points.length || 1;
    const ringWidth = (outer * 0.7) / n;
    const gap = ringWidth * 0.25;
    const startAngle = -Math.PI / 2; // 12 o'clock
    const fullSweep = (Math.PI * 2 * 270) / 360; // sweep 0 → 270 degrees
    // Common x for every category label so they stack in a vertical column.
    const labelX = cx - 8;

    points.forEach((p, i) => {
      const value = p.y ?? 0;
      const rOuter = outer - i * ringWidth;
      const rInner = rOuter - (ringWidth - gap);
      const color = p.color ?? paletteColor(colors, this.points.indexOf(p));
      const frac = Math.max(0, Math.min(1, value / max));

      // Track (background) full ring.
      renderer.create('path', {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep),
        fill: alpha(color, 0.15),
        stroke: 'none',
      }, g);

      // Value arc.
      const el = renderer.create('path', {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep * frac),
        fill: color,
        stroke: 'none',
        class: 'facet-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      // Category label at the ring start, right-aligned to a shared x so all
      // labels line up in a vertical column.
      renderer.text(String(p.name ?? p.x), labelX, cy - (rInner + rOuter) / 2 + 4, {
        'text-anchor': 'end',
        ...FONTS.dataLabel,
        'font-size': '10px',
      }, g);
    });
  }

  /** A filled band between two radii swept between two angles. */
  private arcBand(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
    if (a1 <= a0 + 1e-4) return '';
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const ox0 = cx + ro * Math.cos(a0);
    const oy0 = cy + ro * Math.sin(a0);
    const ox1 = cx + ro * Math.cos(a1);
    const oy1 = cy + ro * Math.sin(a1);
    const ix1 = cx + ri * Math.cos(a1);
    const iy1 = cy + ri * Math.sin(a1);
    const ix0 = cx + ri * Math.cos(a0);
    const iy0 = cy + ri * Math.sin(a0);
    return (
      `M ${ox0} ${oy0} A ${ro} ${ro} 0 ${large} 1 ${ox1} ${oy1} ` +
      `L ${ix1} ${iy1} A ${ri} ${ri} 0 ${large} 0 ${ix0} ${iy0} Z`
    );
  }
}
