/**
 * Radial bar series. Each point becomes a concentric ring whose arc length is
 * proportional to its value (the familiar "activity rings" look). Polar, so it
 * ignores the cartesian axes and lays out from the plot centre.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, alpha } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { scaledFontPx } from '../core/theme.js';

export interface RadialBarSeriesOptions {
  /** Arc start in degrees (default -90, at 12 o'clock). */
  startAngle?: number;
  /** Arc end in degrees (default 180, producing a 270-degree sweep). */
  endAngle?: number;
}

export class RadialBarSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: true, pointLegend: true };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-radialbar ${this.name}` }, renderer.root);

    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const outer = Math.min(plot.width, plot.height) / 2 - 4;

    const points = this.visiblePoints();
    const stacked = !!this.options.stacking;
    const categories =
      stacked && ctx.radialCategories?.length
        ? ctx.radialCategories
        : points.map((point) => point.x);
    const categoryIndex = new Map(
      categories.map((category, index) => [
        `${typeof category}:${String(category)}`,
        index,
      ]),
    );
    const max = stacked
      ? (ctx.radialValueMax ??
        Math.max(1, ...points.map((p) => p.stackHigh ?? p.y ?? 0)))
      : Math.max(1, ...points.map((p) => p.y ?? 0));
    const n = categories.length || 1;
    const ringWidth = (outer * 0.7) / n;
    const gap = ringWidth * 0.25;
    const startAngleDegrees = this.options.startAngle ?? -90;
    const endAngleDegrees = this.options.endAngle ?? 180;
    const sweepDegrees = endAngleDegrees - startAngleDegrees;
    if (
      !Number.isFinite(startAngleDegrees) ||
      !Number.isFinite(endAngleDegrees) ||
      sweepDegrees <= 0 ||
      sweepDegrees > 360
    ) {
      throw new RangeError(
        'FacetViz: radialbar startAngle/endAngle must define a positive sweep of at most 360 degrees',
      );
    }
    const startAngle = (startAngleDegrees * Math.PI) / 180;
    const fullSweep = (sweepDegrees * Math.PI) / 180;
    // Common x for every category label so they stack in a vertical column.
    const labelX = cx - 8;

    const ringGeometry = (index: number) => {
      const rOuter = outer - index * ringWidth;
      return {
        rOuter,
        rInner: rOuter - (ringWidth - gap),
      };
    };
    const drawTrack = (
      index: number,
      label: string,
      color: string,
    ) => {
      const { rInner, rOuter } = ringGeometry(index);
      renderer.create('path', {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep),
        fill: alpha(color, 0.15),
        stroke: 'none',
        class: 'facet-radialbar-track',
      }, g);
      // Ring geometry always draws; only the label backs off on a chart too
      // small for data-style labels (see `Chart.suppressDataLabels`).
      if (ctx.suppressDataLabels) return;
      renderer.text(label, labelX, cy - (rInner + rOuter) / 2 + 4, {
        'text-anchor': 'end',
        ...FONTS.dataLabel,
        'font-size': scaledFontPx(10),
        class: 'facet-radialbar-label',
      }, g);
    };

    if (stacked && ctx.radialSeriesIndex === 0) {
      const labels = new Map(
        points.map((point) => [
          `${typeof point.x}:${String(point.x)}`,
          String(point.name ?? point.x),
        ]),
      );
      categories.forEach((category, index) => {
        const key = `${typeof category}:${String(category)}`;
        drawTrack(index, labels.get(key) ?? String(category), this.color);
      });
    }

    points.forEach((p, pointIndex) => {
      const value = p.y ?? 0;
      const index = stacked
        ? (categoryIndex.get(`${typeof p.x}:${String(p.x)}`) ?? pointIndex)
        : pointIndex;
      const { rInner, rOuter } = ringGeometry(index);
      const color =
        p.color ??
        (stacked ? this.color : paletteColor(colors, this.points.indexOf(p)));
      const low = stacked ? (p.stackLow ?? 0) : 0;
      const high = stacked ? (p.stackHigh ?? value) : value;
      const startFraction = Math.max(0, Math.min(1, low / max));
      const endFraction = Math.max(0, Math.min(1, high / max));

      if (!stacked) drawTrack(index, String(p.name ?? p.x), color);

      // Value arc.
      const el = renderer.create('path', {
        d: this.arcBand(
          cx,
          cy,
          rInner,
          rOuter,
          startAngle + fullSweep * startFraction,
          startAngle + fullSweep * endFraction,
        ),
        fill: color,
        stroke: 'none',
        class: 'facet-point',
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    });
  }

  /** A filled band between two radii swept between two angles. */
  private arcBand(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number): string {
    if (a1 <= a0 + 1e-4) return '';
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
      const mid = a0 + Math.PI;
      const ox0 = cx + ro * Math.cos(a0);
      const oy0 = cy + ro * Math.sin(a0);
      const oxm = cx + ro * Math.cos(mid);
      const oym = cy + ro * Math.sin(mid);
      const ix0 = cx + ri * Math.cos(a0);
      const iy0 = cy + ri * Math.sin(a0);
      const ixm = cx + ri * Math.cos(mid);
      const iym = cy + ri * Math.sin(mid);
      return (
        `M ${ox0} ${oy0} ` +
        `A ${ro} ${ro} 0 0 1 ${oxm} ${oym} ` +
        `A ${ro} ${ro} 0 0 1 ${ox0} ${oy0} ` +
        `L ${ix0} ${iy0} ` +
        `A ${ri} ${ri} 0 0 0 ${ixm} ${iym} ` +
        `A ${ri} ${ri} 0 0 0 ${ix0} ${iy0} Z`
      );
    }
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
