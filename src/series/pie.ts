/**
 * Pie / donut series. Ignores the cartesian axes and instead lays slices out
 * around the plot-area centre. `donut` (or an `innerSize`) carves a hole.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext, LegendEntry } from './base.js';
import { paletteColor, shade } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { formatNumber, formatString, sum } from '../core/utils.js';
import type { Point } from '../core/point.js';
import type { LabelContext } from '../core/options.js';
import { drawDataLabel } from './data-label.js';

/** Hovered-value label drawn inside a pie/donut's hollow centre. */
export interface PieCenterLabelOptions {
  /** Show the hovered value in the centre. Defaults to true when a hole exists. */
  enabled?: boolean;
  /** Token string, e.g. '{name}: {y:,.1f}' or '{percentage:.0f}%'. */
  format?: string;
  /** Custom text callback. Overrides `format`. */
  formatter?: (ctx: LabelContext) => string;
  /** Text colour. */
  color?: string;
  /** CSS font size, e.g. '20px'. */
  fontSize?: string;
  /** CSS font weight, e.g. '600'. */
  fontWeight?: string;
  /** CSS font family. */
  fontFamily?: string;
}

/** Pie/donut's series-level fields. */
export interface PieSeriesOptions {
  /** Inner radius as a percentage string, e.g. '60%' (makes a donut). */
  innerSize?: string;
  /** Hovered-value label displayed inside the hollow centre. */
  centerLabel?: PieCenterLabelOptions;
  /**
   * Multi-level (two-dimension) rings: field names read from each point. The
   * first is the inner ring (grouped totals), the second the outer ring
   * (breakdown within each inner slice). Outer slices are shaded variants of
   * their parent's colour.
   */
  dimensions?: string[];
}

interface PieCenter { cx: number; cy: number; radius: number; margin: number; outside: boolean; }

/**
 * Tracks the last drawn outside label's y position on each side of the pie,
 * so a shrunk chart with cramped slices thins its own labels out — skipping
 * whichever would collide — instead of the chart forcing every label off.
 */
interface LabelLayout { lastY: { left?: number; right?: number } }

export class PieSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }

  private dims(): string[] | undefined {
    const d = this.options.dimensions;
    return Array.isArray(d) && d.length >= 2 ? d : undefined;
  }

  /** Distinct first-dimension groups (encounter order) for multi-level pies. */
  private groups(): string[] {
    const dims = this.dims();
    if (!dims) return [];
    const seen: string[] = [];
    for (const p of this.points) {
      const k = String(p.options[dims[0]] ?? '');
      if (!seen.includes(k)) seen.push(k);
    }
    return seen;
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
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-pie ${this.name}` }, renderer.root);

    const dl = this.options.dataLabels;
    const outside = !!dl?.enabled && (dl.position ?? 'outside') !== 'inside';
    // Outside labels + leader lines need a wider ring than inside labels.
    const margin = outside ? 48 : 6;
    const c: PieCenter = {
      cx: plot.x + plot.width / 2,
      cy: plot.y + plot.height / 2,
      radius: Math.max(10, Math.min(plot.width, plot.height) / 2 - margin),
      margin,
      outside,
    };

    if (this.dims()) { this.renderMultiLevel(ctx, g, c); return; }

    const layout: LabelLayout = { lastY: {} };
    const innerR = c.radius * this.innerRatio();
    const centerValue = this.drawCenterValue(ctx, g, c, innerR);
    // Only draw visible slices; total is over visible points so hiding a slice
    // via the legend redistributes the remaining ones.
    const points = this.visiblePoints();
    const total = sum(points.map((p) => p.y ?? 0));
    if (total <= 0) return;

    // Variable-radius pie: when points carry a `z`, each slice's outer radius
    // scales with z (angle still comes from y). Smallest slice keeps 45% radius.
    const zs = points.map((p) => p.options.z).filter((z): z is number => typeof z === 'number');
    const variable = zs.length > 0;
    const zMin = variable ? Math.min(...zs) : 0;
    const zMax = variable ? Math.max(...zs) : 1;
    const minR = innerR + (c.radius - innerR) * 0.45;
    const radiusFor = (p: Point) => {
      const z = p.options.z;
      if (!variable || typeof z !== 'number') return c.radius;
      return minR + (c.radius - minR) * (zMax === zMin ? 1 : (z - zMin) / (zMax - zMin));
    };

    let angle = -Math.PI / 2; // start at 12 o'clock
    points.forEach((p) => {
      const value = p.y ?? 0;
      if (value <= 0) return;
      const sweep = (value / total) * Math.PI * 2;
      const end = angle + sweep;
      const color = p.color ?? paletteColor(ctx.colors, this.points.indexOf(p));
      const rr = radiusFor(p);

      const path = this.slicePath(c.cx, c.cy, rr, innerR, angle, end);
      const el = renderer.create('path', { d: path, fill: color, stroke: '#ffffff', 'stroke-width': 1, class: 'facet-point' }, g);
      ctx.registerHover(el, p);
      this.bindCenterValue(el, p, centerValue, total, color);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      const label = this.labelText(p, p.name ?? p.x, value, total);
      this.drawLabel(ctx, g, c, rr, angle, end, label, color, layout);
      angle = end;
    });
  }

  /** Two-dimension pie: inner ring = first field, outer ring = second field. */
  private renderMultiLevel(ctx: SeriesRenderContext, g: SVGGElement, c: PieCenter): void {
    const dims = this.dims()!;
    const { renderer } = ctx;
    const holeR = c.radius * this.innerRatio();
    const midR = holeR + (c.radius - holeR) * 0.55; // inner ring outer edge
    const centerValue = this.drawCenterValue(ctx, g, c, holeR);

    // Group visible points by the inner dimension (encounter order).
    const order = this.groups();
    const buckets = new Map<string, Point[]>();
    for (const g0 of order) buckets.set(g0, []);
    for (const p of this.visiblePoints()) {
      const k = String(p.options[dims[0]] ?? '');
      buckets.get(k)?.push(p);
    }
    const groupTotal = (ps: Point[]) => sum(ps.map((p) => p.y ?? 0));
    const total = sum([...buckets.values()].map(groupTotal));
    if (total <= 0) return;

    const layout: LabelLayout = { lastY: {} };
    let angle = -Math.PI / 2;
    order.forEach((g0, gi) => {
      const ps = buckets.get(g0) ?? [];
      const gVal = groupTotal(ps);
      if (gVal <= 0) return;
      const sweep = (gVal / total) * Math.PI * 2;
      const end = angle + sweep;
      const base = paletteColor(ctx.colors, gi);

      // Inner slice (the group itself).
      const innerPath = this.slicePath(c.cx, c.cy, midR, holeR, angle, end);
      renderer.create('path', { d: innerPath, fill: base, stroke: '#ffffff', 'stroke-width': 1, class: 'facet-point' }, g);
      // Inner label centred within its band, abbreviated to fit the wedge.
      const innerLabelR = (holeR + midR) / 2;
      const mid = (angle + end) / 2;
      // Available width ≈ chord across the wedge at the label radius.
      const chord = 2 * innerLabelR * Math.sin(Math.min(Math.PI, sweep) / 2);
      const bandThickness = midR - holeR;
      const fitted = this.fitText(g0, Math.max(chord, bandThickness) - 4, 6.8);
      if (fitted) {
        renderer.text(fitted, c.cx + innerLabelR * Math.cos(mid), c.cy + innerLabelR * Math.sin(mid), {
          'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel, fill: '#ffffff', 'font-weight': '600',
        }, g);
      }

      // Outer slices (breakdown), shaded variants of the base colour.
      let a2 = angle;
      ps.forEach((p, j) => {
        const value = p.y ?? 0;
        if (value <= 0) return;
        const cs = (value / gVal) * sweep;
        const e2 = a2 + cs;
        const color = p.color ?? shade(base, 0.12 + 0.5 * (ps.length === 1 ? 0 : j / (ps.length - 1)));
        const outerPath = this.slicePath(c.cx, c.cy, c.radius, midR, a2, e2);
        const el = renderer.create('path', { d: outerPath, fill: color, stroke: '#ffffff', 'stroke-width': 1, class: 'facet-point' }, g);
        ctx.registerHover(el, p);
        this.bindCenterValue(el, p, centerValue, total, color);
        el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
        el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
        el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

        const name = String(p.options[dims[1]] ?? p.name ?? p.x);
        const label = this.labelText(p, name, value, total);
        this.drawLabel(ctx, g, c, c.radius, a2, e2, label, color, layout);
        a2 = e2;
      });
      angle = end;
    });
  }

  // -- Legend (multi-level lists the inner-dimension groups) --------------

  override legendItems(colors: string[]): LegendEntry[] | undefined {
    const dims = this.dims();
    if (!dims) return undefined;
    return this.groups().map((g0, i) => ({
      label: g0,
      color: paletteColor(colors, i),
      visible: this.points.some((p) => String(p.options[dims[0]] ?? '') === g0 && !this.hiddenPoints.has(p.index)),
    }));
  }

  override onLegendToggle(index: number): void {
    const dims = this.dims();
    if (!dims) return;
    const g0 = this.groups()[index];
    const pts = this.points.filter((p) => String(p.options[dims[0]] ?? '') === g0);
    const anyVisible = pts.some((p) => !this.hiddenPoints.has(p.index));
    for (const p of pts) {
      if (anyVisible) this.hiddenPoints.add(p.index);
      else this.hiddenPoints.delete(p.index);
    }
  }

  /**
   * Truncate `text` with an ellipsis to fit `availablePx`. Returns '' when even
   * a single character won't fit (label omitted entirely).
   */
  private fitText(text: string, availablePx: number, charW: number): string {
    const maxChars = Math.floor(availablePx / charW);
    if (maxChars < 1) return '';
    if (text.length <= maxChars) return text;
    if (maxChars === 1) return text.slice(0, 1);
    return text.slice(0, maxChars - 1) + '…';
  }

  /** Draw the initially-empty value readout used by charts with a centre hole. */
  private drawCenterValue(
    ctx: SeriesRenderContext,
    g: SVGGElement,
    c: PieCenter,
    innerR: number,
  ): SVGTextElement | undefined {
    const options = this.options.centerLabel;
    if (innerR <= 0 || options?.enabled === false) return undefined;
    return ctx.renderer.text('', c.cx, c.cy, {
      class: 'facet-donut-center-value',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'pointer-events': 'none',
      'aria-hidden': 'true',
      ...FONTS.dataLabel,
      fill: options?.color ?? FONTS.dataLabel.fill,
      'font-size': options?.fontSize ?? `${Math.max(12, Math.min(24, innerR * 0.38))}px`,
      'font-weight': options?.fontWeight ?? '600',
      'font-family': options?.fontFamily,
    }, g);
  }

  /** Keep the centre readout in sync with pointer and keyboard hover state. */
  private bindCenterValue(
    el: SVGElement,
    p: Point,
    centerValue: SVGTextElement | undefined,
    total: number,
    color: string,
  ): void {
    if (!centerValue) return;
    const show = () => {
      const value = p.y ?? 0;
      const context: LabelContext = {
        x: p.x,
        y: value,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color,
        percentage: total ? (value / total) * 100 : 0,
        total,
      };
      const options = this.options.centerLabel;
      centerValue.textContent = options?.formatter
        ? options.formatter(context)
        : options?.format
          ? formatString(options.format, { ...context })
          : formatNumber(value, {
              decimals: this.options.tooltip?.valueDecimals,
              prefix: this.options.tooltip?.valuePrefix,
              suffix: this.options.tooltip?.valueSuffix,
            });
    };
    const hide = () => { centerValue.textContent = ''; };
    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);
  }

  /** Build the label string for a slice from the series' dataLabels config. */
  private labelText(p: Point, name: string | number | undefined, value: number, total: number): string {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return ''; // labels disabled → nothing to draw
    const percentage = total ? (value / total) * 100 : 0;
    const label = name ?? '';
    if (dl.formatter) {
      return dl.formatter({ x: p.x, y: value, point: p.options, series: this.name, name: label, index: p.index, color: p.color, percentage, total });
    }
    return formatString(dl.format ?? '{name}: {percentage:.1f}%', {
      name: label, x: p.x, y: value, percentage, total, series: this.name, index: p.index, color: p.color, point: p.options,
    });
  }

  /**
   * Draw a slice label. Inside labels sit on the ring; outside labels are placed
   * beyond the rim and joined to the slice with a leader line (elbow + stub) so
   * it is unambiguous which label belongs to which slice.
   *
   * A shrunk pie packs slices (and their labels) closer together — rather than
   * the chart forcing every label off past some size threshold, a label that
   * doesn't fit its own slice (inside) or would collide with the previous one
   * on its side (outside) is simply skipped, leaving the rest legible.
   */
  private drawLabel(
    ctx: SeriesRenderContext,
    g: SVGGElement,
    c: PieCenter,
    rimR: number,
    a0: number,
    a1: number,
    text: string,
    sliceColor: string,
    layout: LabelLayout,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled || !text) return;
    const { renderer } = ctx;
    const mid = (a0 + a1) / 2;
    const fontPx = parseFloat(dl.fontSize ?? FONTS.dataLabel['font-size'] ?? '11') || 11;

    if (!c.outside) {
      const lr = rimR * 0.72;
      // Skip a label whose slice is too thin to fit it — a 5% sliver reading
      // "Other: 0.8%" just smears text across its neighbours otherwise.
      const chord = 2 * lr * Math.sin(Math.min(Math.PI, a1 - a0) / 2);
      if (text.length * fontPx * 0.62 > chord) return;
      drawDataLabel(
        renderer,
        g,
        text,
        {
          x: c.cx + lr * Math.cos(mid),
          y: c.cy + lr * Math.sin(mid) + fontPx * 0.35,
          anchor: 'middle',
        },
        { ...dl, color: dl.color ?? '#ffffff' },
      );
      return;
    }

    // Leader line: rim point → elbow just outside the rim → short horizontal stub.
    const dir = Math.cos(mid) >= 0 ? 1 : -1;
    const side = dir > 0 ? 'right' : 'left';
    const rimX = c.cx + rimR * Math.cos(mid);
    const rimY = c.cy + rimR * Math.sin(mid);
    const elbowR = rimR + 10 + (dl.distance ?? 0);
    const elbowX = c.cx + elbowR * Math.cos(mid);
    const elbowY = c.cy + elbowR * Math.sin(mid);
    const stubX = elbowX + dir * 16;

    // Points are walked in angle order and stay on one side for a full half
    // revolution, so comparing against only the last label drawn on this side
    // is enough to keep every remaining one legibly spaced.
    const lastY = layout.lastY[side];
    if (lastY !== undefined && Math.abs(elbowY - lastY) < fontPx + 3) return;
    layout.lastY[side] = elbowY;

    renderer.create('polyline', {
      points: `${rimX},${rimY} ${elbowX},${elbowY} ${stubX},${elbowY}`,
      fill: 'none', stroke: dl.color ?? sliceColor, 'stroke-width': 1,
    }, g);

    drawDataLabel(
      renderer,
      g,
      text,
      {
        x: stubX + dir * 4,
        y: elbowY + fontPx * 0.35,
        anchor: dir > 0 ? 'start' : 'end',
      },
      dl,
    );
  }

  private slicePath(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
    // SVG cannot represent a full circle with a single arc because its start
    // and end points coincide. Split a 100% slice into two half-arcs so pies
    // and donuts with only one point remain visible.
    if (a1 - a0 >= Math.PI * 2 - 1e-10) {
      const am = a0 + Math.PI;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const xm = cx + r * Math.cos(am);
      const ym = cy + r * Math.sin(am);

      if (ir <= 0) {
        return (
          `M ${cx} ${cy} L ${x0} ${y0} ` +
          `A ${r} ${r} 0 1 1 ${xm} ${ym} A ${r} ${r} 0 1 1 ${x0} ${y0} Z`
        );
      }

      const ix0 = cx + ir * Math.cos(a0);
      const iy0 = cy + ir * Math.sin(a0);
      const ixm = cx + ir * Math.cos(am);
      const iym = cy + ir * Math.sin(am);
      return (
        `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${xm} ${ym} A ${r} ${r} 0 1 1 ${x0} ${y0} ` +
        `L ${ix0} ${iy0} A ${ir} ${ir} 0 1 0 ${ixm} ${iym} A ${ir} ${ir} 0 1 0 ${ix0} ${iy0} Z`
      );
    }

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
}
