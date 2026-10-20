/**
 * Decomposition tree — a total split into its parts, level by level. Each
 * point is a node `{ level, name, y, opened?, valueText? }`: level 0 is the
 * whole (one node), each next level the parts of the node opened in the
 * level before (`opened: true`). Levels are columns left to right, each with
 * its heading (`levels[i]`); a node is a bar as long as its value against
 * the largest in its column, and curves join the opened node to its parts.
 * Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { FONTS } from '../core/defaults.js';
import { scaledFontPx } from '../core/theme.js';
import type { Point } from '../core/point.js';

/** A node of the tree. */
export interface DecompPointOptions {
  /** Its column: 0 is the whole. */
  level?: number;
  /** The node whose parts the next column shows. */
  opened?: boolean;
  /** Its value as shown; the number itself when unset. */
  valueText?: string;
}

/** Decomposition tree series options, beside the common ones. */
export interface DecompSeriesOptions {
  /** Each column's heading, from the whole on. */
  levels?: string[];
}

/** `text`, or as much of it as fits `width` followed by “…” (nothing when not even that fits). */
export function fitText(text: string, width: number, measure: (t: string) => number): string {
  if (measure(text) <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid).trimEnd() + '…') <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo).trimEnd() + '…' : measure('…') <= width ? '…' : '';
}

const NODE_H = 36;
const GAP = 8;
const HEAD = 26;
const MAX_COL = 240;

export class DecompSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-decomp ${this.name}` }, renderer.root);
    const o = this.options as typeof this.options & DecompSeriesOptions;
    const byLevel = new Map<number, Point[]>();
    for (const p of this.points) {
      const l = Math.max(0, Math.floor(Number(p.options.level ?? 0)));
      (byLevel.get(l) ?? byLevel.set(l, []).get(l)!).push(p);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    if (!levels.length) return;
    const cols = levels.length;
    const colW = Math.min(MAX_COL, plot.width / cols);
    const link = Math.min(70, colW * 0.28);
    const barW = colW - link;
    const top = plot.y + HEAD;
    // Nodes that fit the plot's height, per column.
    const fit = Math.max(1, Math.floor((plot.height - HEAD + GAP) / (NODE_H + GAP)));
    const placed: { p: Point; x: number; y: number }[][] = [];

    levels.forEach((l, ci) => {
      const x = plot.x + ci * colW;
      const head = o.levels?.[ci] ?? '';
      if (head) renderer.text(head, x, plot.y + 12, { ...FONTS.axisTitle, 'font-size': scaledFontPx(12), 'font-weight': 600, 'dominant-baseline': 'middle' }, g);
      const nodes = byLevel.get(l)!.slice(0, fit);
      const max = Math.max(...nodes.map((p) => Math.abs(p.y ?? 0)), 0);
      // A column shorter than the one before sits level with its opened node.
      const prev = placed[ci - 1];
      const opened = prev?.find((n) => n.p.options.opened);
      const height = nodes.length * (NODE_H + GAP) - GAP;
      let y0 = top;
      if (opened) y0 = Math.max(top, Math.min(opened.y + NODE_H / 2 - height / 2, plot.y + plot.height - height));
      const col: { p: Point; x: number; y: number }[] = [];
      nodes.forEach((p, i) => {
        const y = y0 + i * (NODE_H + GAP);
        const value = p.y ?? 0;
        const w = max > 0 ? Math.max(2, (Math.abs(value) / max) * (barW - 4)) : 2;
        const open = !!p.options.opened;
        const color = p.color ?? this.color;
        const node = renderer.group({ class: `facet-point facet-decomp-node${open ? ' facet-decomp-open' : ''}`, cursor: 'pointer' }, g);
        renderer.create('rect', { x, y, width: barW, height: NODE_H, rx: 4, fill: 'transparent', stroke: open ? color : 'none', 'stroke-width': open ? 1.5 : 0 }, node);
        renderer.create('rect', { x: x + 2, y: y + NODE_H - 9, width: w, height: 6, rx: 3, fill: color, opacity: value < 0 ? 0.45 : 0.9 }, node);
        const nameAttrs = { ...FONTS.axisLabel, 'font-size': scaledFontPx(11.5), 'dominant-baseline': 'middle' };
        const valueAttrs = { ...FONTS.dataLabel, 'font-size': scaledFontPx(11.5), 'font-weight': 600, 'text-anchor': 'end', 'dominant-baseline': 'middle' };
        const shown = String(p.options.valueText ?? value);
        // The name gets the room the value leaves, cut short with “…”.
        const room = barW - 8 - (shown ? renderer.measureText(shown, valueAttrs).width + 8 : 0);
        const full = String(p.name ?? '');
        const name = fitText(full, room, (t) => renderer.measureText(t, nameAttrs).width);
        const label = renderer.text(name, x + 4, y + 11, nameAttrs, node);
        if (name !== full) renderer.create('title', {}, label).textContent = full;
        if (shown) renderer.text(shown, x + barW - 4, y + 11, valueAttrs, node);
        ctx.registerHover(node as unknown as SVGElement, p);
        node.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
        node.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
        node.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
        col.push({ p, x, y });
      });
      // Curves from the opened node to each of its parts.
      if (opened) {
        const x1 = opened.x + barW;
        const y1 = opened.y + NODE_H / 2;
        for (const n of col) {
          const y2 = n.y + NODE_H / 2;
          const mx = (x1 + n.x) / 2;
          renderer.create('path', { d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${n.x} ${y2}`, fill: 'none', stroke: n.p.color ?? this.color, 'stroke-opacity': 0.35, 'stroke-width': 1.5, class: 'facet-decomp-link' }, g);
        }
      }
      placed.push(col);
    });
  }
}
