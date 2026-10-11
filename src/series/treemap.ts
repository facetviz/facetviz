/**
 * Treemap — a hierarchy drawn as nested rectangles, each sized by its value.
 * Nodes are given as for the sunburst: flat `{ id, parent, name, value }`,
 * leaf values rolling up to their ancestors; a flat list without parents is a
 * one-level treemap. Siblings are laid out with the squarified algorithm, so
 * rectangles stay close to square and easy to compare. A node with children
 * draws as a frame with its name in a header band, its children inside.
 * Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, shade } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { scaledFontPx } from '../core/theme.js';
import type { Point } from '../core/point.js';

export interface TreemapRect { x: number; y: number; width: number; height: number; }

interface Node { point?: Point; id: string; name: string; value: number; depth: number; children: Node[]; }

/** Space between a frame and its children, and the header band holding a frame's name. */
const PAD = 2;
const HEADER = 16;

/**
 * Squarified layout (Bruls, Huizing & van Wijk): rectangles for `values`
 * (in the same order) that tile `rect`, each with an area proportional to its
 * value. Zero, negative or non-finite values get an empty rectangle.
 */
export function squarify(values: number[], rect: TreemapRect): TreemapRect[] {
  const out: TreemapRect[] = values.map(() => ({ x: rect.x, y: rect.y, width: 0, height: 0 }));
  const items = values
    .map((v, i) => ({ i, v: Number.isFinite(v) && v > 0 ? v : 0 }))
    .filter((d) => d.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = items.reduce((s, d) => s + d.v, 0);
  if (!total || rect.width <= 0 || rect.height <= 0) return out;
  const scale = (rect.width * rect.height) / total;
  const areas = items.map((d) => ({ i: d.i, a: d.v * scale }));
  let free = { ...rect };

  // How far the row's rectangles stray from squares, laid along `side`.
  const worst = (row: number[], side: number): number => {
    const s = row.reduce((x, y) => x + y, 0);
    const max = Math.max(...row), min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = (row: Array<{ i: number; a: number }>) => {
    const s = row.reduce((x, d) => x + d.a, 0);
    if (free.width >= free.height) {
      // A column on the left, full height.
      const w = free.height ? s / free.height : 0;
      let y = free.y;
      for (const d of row) {
        const h = w ? d.a / w : 0;
        out[d.i] = { x: free.x, y, width: w, height: h };
        y += h;
      }
      free = { x: free.x + w, y: free.y, width: Math.max(0, free.width - w), height: free.height };
    } else {
      // A row along the top, full width.
      const h = free.width ? s / free.width : 0;
      let x = free.x;
      for (const d of row) {
        const w = h ? d.a / h : 0;
        out[d.i] = { x, y: free.y, width: w, height: h };
        x += w;
      }
      free = { x: free.x, y: free.y + h, width: free.width, height: Math.max(0, free.height - h) };
    }
  };

  let row: Array<{ i: number; a: number }> = [];
  for (const d of areas) {
    const side = Math.min(free.width, free.height);
    const current = row.map((r) => r.a);
    if (!row.length || worst([...current, d.a], side) <= worst(current, side)) {
      row.push(d);
    } else {
      place(row);
      row = [d];
    }
  }
  if (row.length) place(row);
  return out;
}

/** Light text on a dark fill, dark text on a light one. */
function textOn(fill: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(fill);
  if (!m) return '#fff';
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#1f2328' : '#fff';
}

/** `text` cut to about `width` px at the label size, with an ellipsis. */
function fit(text: string, width: number): string {
  const chars = Math.floor(width / 6.2);
  if (chars < 2) return '';
  return text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1))}…`;
}

export class TreemapSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-treemap ${this.name}` }, renderer.root);

    // The tree, as the sunburst builds it.
    const byId = new Map<string, Node>();
    for (const p of this.points) {
      const id = String(p.options.id ?? p.name ?? p.x);
      byId.set(id, { point: p, id, name: String(p.name ?? p.options.name ?? id), value: p.y ?? (p.options.value as number) ?? 0, depth: 0, children: [] });
    }
    const roots: Node[] = [];
    for (const n of byId.values()) {
      const parent = n.point?.options.parent ? byId.get(String(n.point.options.parent)) : undefined;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    const rollup = (n: Node): number => {
      if (n.children.length) n.value = n.children.reduce((s, c) => s + rollup(c), 0);
      return Number.isFinite(n.value) && n.value > 0 ? n.value : 0;
    };
    const total = roots.reduce((s, r) => s + rollup(r), 0);
    if (total <= 0) return;
    const setDepth = (n: Node, d: number) => { n.depth = d; n.children.forEach((c) => setDepth(c, d + 1)); };
    roots.forEach((r) => setDepth(r, 0));

    const dl = this.options.dataLabels;
    const labels = dl?.enabled !== false && !ctx.suppressDataLabels;
    const valueText = (n: Node, fill: string): string => {
      if (dl?.formatter && n.point) {
        const p = n.point;
        return dl.formatter({ x: p.x ?? '', y: n.value, point: p.options, series: this.name, name: n.name, index: p.index, color: fill });
      }
      return String(Number(n.value.toPrecision(6)));
    };
    const wire = (el: SVGElement, n: Node) => {
      if (!n.point) return;
      const p = n.point;
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    };

    const draw = (nodes: Node[], area: TreemapRect, base: string | null) => {
      const rects = squarify(nodes.map((n) => n.value), area);
      nodes.forEach((n, i) => {
        const r = rects[i];
        if (r.width < 1 || r.height < 1) return;
        // Top-level nodes take palette colours; their descendants shades of it.
        const own = base ?? paletteColor(colors, i);
        const fill = n.point?.color ?? (base ? shade(own, n.depth * 0.1 + (i % 3) * 0.05) : own);
        if (n.children.length) {
          const frame = renderer.create('rect', {
            x: r.x, y: r.y, width: r.width, height: r.height, fill: shade(own, -0.15), stroke: '#fff', 'stroke-width': 1, class: 'facet-point facet-treemap-group',
          }, g);
          wire(frame, n);
          const header = r.height > HEADER * 2 && r.width > 24 ? HEADER : 0;
          if (header && labels) {
            const t = fit(n.name, r.width - 8);
            if (t) renderer.text(t, r.x + 4, r.y + header / 2 + 1, {
              'dominant-baseline': 'middle', ...FONTS.dataLabel, fill: textOn(shade(own, -0.15)), 'font-size': scaledFontPx(10), 'font-weight': 600,
            }, g);
          }
          draw(n.children, {
            x: r.x + PAD, y: r.y + header + PAD,
            width: Math.max(0, r.width - PAD * 2), height: Math.max(0, r.height - header - PAD * 2),
          }, own);
          return;
        }
        const el = renderer.create('rect', {
          x: r.x, y: r.y, width: r.width, height: r.height, fill, stroke: '#fff', 'stroke-width': 1, class: 'facet-point',
        }, g);
        wire(el, n);
        if (labels && r.width > 36 && r.height > 18) {
          const color = textOn(fill);
          const name = fit(n.name, r.width - 8);
          if (name) renderer.text(name, r.x + 4, r.y + 12, { ...FONTS.dataLabel, fill: color, 'font-size': scaledFontPx(10) }, g);
          if (r.height > 34) {
            const v = fit(valueText(n, fill), r.width - 8);
            if (v) renderer.text(v, r.x + 4, r.y + 26, { ...FONTS.dataLabel, fill: color, 'font-size': scaledFontPx(10), opacity: 0.85 }, g);
          }
        }
      });
    };
    draw(roots, { x: plot.x, y: plot.y, width: plot.width, height: plot.height }, null);
  }
}
