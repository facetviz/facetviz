/**
 * Sankey — weighted flows between nodes. Each point is a link
 * `{ from, to, weight }`. Nodes are placed in columns by their longest distance
 * from a source; node height encodes throughput and links are drawn as
 * translucent ribbons whose thickness is their weight. Self-contained.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, alpha } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import type { Point } from '../core/point.js';

interface Link { from: string; to: string; weight: number; point: Point; }
interface Node { id: string; depth: number; inflow: number; outflow: number; x: number; y: number; h: number; color: string; }

export class SankeySeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-sankey ${this.name}` }, renderer.root);

    const links: Link[] = this.points
      .map((p) => ({ from: String(p.options.from ?? ''), to: String(p.options.to ?? ''), weight: (p.options.weight as number) ?? p.y ?? 1, point: p }))
      .filter((l) => l.from && l.to);
    if (!links.length) return;

    const nodes = new Map<string, Node>();
    const node = (id: string) => nodes.get(id) ?? (nodes.set(id, { id, depth: 0, inflow: 0, outflow: 0, x: 0, y: 0, h: 0, color: '' }).get(id)!);
    for (const l of links) { node(l.from).outflow += l.weight; node(l.to).inflow += l.weight; }

    // Longest-path depth (guard against cycles with a bounded pass count).
    for (let pass = 0; pass < nodes.size; pass++) {
      let changed = false;
      for (const l of links) {
        const s = node(l.from), t = node(l.to);
        if (t.depth < s.depth + 1) { t.depth = s.depth + 1; changed = true; }
      }
      if (!changed) break;
    }
    const maxDepth = Math.max(...[...nodes.values()].map((n) => n.depth));

    const nodeW = 14;
    const vGap = 8;
    const colWidth = maxDepth > 0 ? (plot.width - nodeW - 16) / maxDepth : 0;
    const columns: Node[][] = Array.from({ length: maxDepth + 1 }, () => []);
    let ci = 0;
    for (const n of nodes.values()) { columns[n.depth].push(n); n.color = paletteColor(colors, ci++); }

    // ONE value→pixel scale for the whole diagram (driven by the tallest column)
    // so node heights and link thicknesses agree and ribbons fill node edges.
    const colValue = (col: Node[]) => col.reduce((s, n) => s + Math.max(n.inflow, n.outflow), 0);
    const maxColVal = Math.max(1, ...columns.map(colValue));
    const maxColCount = Math.max(1, ...columns.map((c) => c.length));
    const unit = (plot.height - vGap * (maxColCount - 1)) / maxColVal;

    for (const col of columns) {
      const colH = col.reduce((s, n) => s + Math.max(n.inflow, n.outflow) * unit, 0) + vGap * (col.length - 1);
      let y = plot.y + (plot.height - colH) / 2; // centre shorter columns vertically
      for (const n of col) {
        n.h = Math.max(2, Math.max(n.inflow, n.outflow) * unit);
        n.x = plot.x + n.depth * colWidth;
        n.y = y;
        y += n.h + vGap;
      }
    }

    // Links (behind nodes) — same `unit` scale, so they stack to fill node edges.
    const outOff = new Map<string, number>(), inOff = new Map<string, number>();
    for (const l of links) {
      const s = node(l.from), t = node(l.to);
      const th = Math.max(1, l.weight * unit);
      const so = outOff.get(s.id) ?? 0, to = inOff.get(t.id) ?? 0;
      const y1 = s.y + so + th / 2, y2 = t.y + to + th / 2;
      const x1 = s.x + nodeW, x2 = t.x;
      const mx = (x1 + x2) / 2;
      const path = renderer.create('path', {
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        fill: 'none', stroke: alpha(s.color, 0.4), 'stroke-width': th, class: 'facet-point',
      }, g);
      ctx.registerHover(path, l.point);
      path.addEventListener('click', (e: Event) => ctx.onPointEvent('click', l.point, e));
      outOff.set(s.id, so + th); inOff.set(t.id, to + th);
    }

    // Nodes + labels.
    for (const n of nodes.values()) {
      renderer.create('rect', { x: n.x, y: n.y, width: nodeW, height: n.h, fill: n.color, rx: 2 }, g);
      const leftSide = n.depth < maxDepth / 2;
      renderer.text(n.id, leftSide ? n.x + nodeW + 4 : n.x - 4, n.y + n.h / 2, {
        'text-anchor': leftSide ? 'start' : 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel,
      }, g);
    }
  }
}
