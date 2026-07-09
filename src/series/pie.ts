/**
 * Pie / donut series. Ignores the cartesian axes and instead lays slices out
 * around the plot-area centre. `donut` (or an `innerSize`) carves a hole.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext, LegendEntry } from './base.js';
import { paletteColor, shade } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { formatString, sum } from '../core/utils.js';
import type { Point } from '../core/point.js';

interface PieCenter { cx: number; cy: number; radius: number; margin: number; outside: boolean; }

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
    const g = renderer.group({ class: `jchart-series jchart-pie ${this.name}` }, renderer.root);

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

    const innerR = c.radius * this.innerRatio();
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
      const el = renderer.create('path', { d: path, fill: color, stroke: '#ffffff', 'stroke-width': 1, class: 'jchart-point' }, g);
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

      const label = this.labelText(p, p.name ?? p.x, value, total);
      this.drawLabel(ctx, g, c, rr, (angle + end) / 2, label, color);
      angle = end;
    });
  }

  /** Two-dimension pie: inner ring = first field, outer ring = second field. */
  private renderMultiLevel(ctx: SeriesRenderContext, g: SVGGElement, c: PieCenter): void {
    const dims = this.dims()!;
    const { renderer } = ctx;
    const holeR = c.radius * this.innerRatio();
    const midR = holeR + (c.radius - holeR) * 0.55; // inner ring outer edge

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
      renderer.create('path', { d: innerPath, fill: base, stroke: '#ffffff', 'stroke-width': 1, class: 'jchart-point' }, g);
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
        const el = renderer.create('path', { d: outerPath, fill: color, stroke: '#ffffff', 'stroke-width': 1, class: 'jchart-point' }, g);
        ctx.registerHover(el, p);
        el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
        el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
        el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));

        const name = String(p.options[dims[1]] ?? p.name ?? p.x);
        const label = this.labelText(p, name, value, total);
        this.drawLabel(ctx, g, c, c.radius, (a2 + e2) / 2, label, color);
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

  /** Build the label string for a slice from the series' dataLabels config. */
  private labelText(p: Point, name: string | number | undefined, value: number, total: number): string {
    const dl = this.options.dataLabels!;
    const pct = ((value / total) * 100).toFixed(1);
    return dl.formatter
      ? dl.formatter({ x: p.x, y: p.y, point: p.options, series: this.name })
      : formatString(dl.format ?? '{name}: {percentage}%', {
          name: name ?? '', y: value, percentage: pct, point: p.options,
        });
  }

  /**
   * Draw a slice label. Inside labels sit on the ring; outside labels are placed
   * beyond the rim and joined to the slice with a leader line (elbow + stub) so
   * it is unambiguous which label belongs to which slice.
   */
  private drawLabel(ctx: SeriesRenderContext, g: SVGGElement, c: PieCenter, rimR: number, mid: number, text: string, sliceColor: string): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled || !text) return;
    const { renderer } = ctx;

    if (!c.outside) {
      const lr = rimR * 0.72;
      renderer.text(text, c.cx + lr * Math.cos(mid), c.cy + lr * Math.sin(mid), {
        'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel,
        fill: dl.color ?? '#ffffff', ...(dl.fontSize ? { 'font-size': dl.fontSize } : {}),
      }, g);
      return;
    }

    // Leader line: rim point → elbow just outside the rim → short horizontal stub.
    const dir = Math.cos(mid) >= 0 ? 1 : -1;
    const rimX = c.cx + rimR * Math.cos(mid);
    const rimY = c.cy + rimR * Math.sin(mid);
    const elbowR = rimR + 10 + (dl.distance ?? 0);
    const elbowX = c.cx + elbowR * Math.cos(mid);
    const elbowY = c.cy + elbowR * Math.sin(mid);
    const stubX = elbowX + dir * 16;

    renderer.create('polyline', {
      points: `${rimX},${rimY} ${elbowX},${elbowY} ${stubX},${elbowY}`,
      fill: 'none', stroke: dl.color ?? sliceColor, 'stroke-width': 1,
    }, g);

    renderer.text(text, stubX + dir * 4, elbowY, {
      'text-anchor': dir > 0 ? 'start' : 'end', 'dominant-baseline': 'middle',
      ...FONTS.dataLabel, fill: dl.color ?? FONTS.dataLabel.fill,
      ...(dl.fontSize ? { 'font-size': dl.fontSize } : {}),
    }, g);
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
}
