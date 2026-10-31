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

/** Sankey's point-level fields — each point is one weighted flow link. */
export interface SankeyPointOptions {
  from?: string;
  to?: string;
  weight?: number;
}

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
      .map((p) => ({ from: String(p.options.from ?? ''), to: String(p.options.to ?? ''), weight: p.options.weight ?? p.y ?? 1, point: p }))
      .filter((l) => l.from && l.to && Number.isFinite(l.weight) && l.weight > 0);
    if (!links.length) return;

    const nodes = new Map<string, Node>();
    const node = (id: string) => nodes.get(id) ?? (nodes.set(id, { id, depth: 0, inflow: 0, outflow: 0, x: 0, y: 0, h: 0, color: '' }).get(id)!);
    for (const l of links) { node(l.from).outflow += l.weight; node(l.to).inflow += l.weight; }

    // Longest-path depth in topological order. Cyclic flow has no valid
    // left-to-right Sankey layout, so reject it instead of inventing depths.
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, Link[]>();
    for (const id of nodes.keys()) incoming.set(id, 0);
    for (const l of links) {
      incoming.set(l.to, (incoming.get(l.to) ?? 0) + 1);
      const list = outgoing.get(l.from) ?? [];
      list.push(l);
      outgoing.set(l.from, list);
    }
    const queue = [...nodes.keys()].filter((id) => incoming.get(id) === 0);
    let visited = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const id = queue[qi];
      visited++;
      const source = node(id);
      for (const l of outgoing.get(id) ?? []) {
        const target = node(l.to);
        target.depth = Math.max(target.depth, source.depth + 1);
        const next = (incoming.get(l.to) ?? 1) - 1;
        incoming.set(l.to, next);
        if (next === 0) queue.push(l.to);
      }
    }
    if (visited !== nodes.size)
      throw new Error("FacetViz: sankey links must form an acyclic graph");
    const maxDepth = Math.max(...[...nodes.values()].map((n) => n.depth));

    const nodeW = 14;
    const colWidth = maxDepth > 0 ? (plot.width - nodeW - 16) / maxDepth : 0;
    const columns: Node[][] = Array.from({ length: maxDepth + 1 }, () => []);
    // One colour per name, so a value keeps its colour at every step (names
    // may carry zero-width marks to keep each step's nodes apart).
    const colorByName = new Map<string, string>();
    for (const n of nodes.values()) {
      columns[n.depth].push(n);
      const name = n.id.replace(/[\u200b-\u200d\ufeff]/g, '');
      if (!colorByName.has(name)) colorByName.set(name, paletteColor(colors, colorByName.size));
      n.color = colorByName.get(name)!;
    }

    // ONE value→pixel scale for the whole diagram (driven by the tallest column)
    // so node heights and link thicknesses agree and ribbons fill node edges.
    // The gap between nodes shrinks so the tallest column always fits.
    const colValue = (col: Node[]) => col.reduce((s, n) => s + Math.max(n.inflow, n.outflow), 0);
    const maxColVal = Math.max(1, ...columns.map(colValue));
    const maxColCount = Math.max(1, ...columns.map((c) => c.length));
    const vGap = maxColCount > 1 ? Math.min(8, (plot.height * 0.3) / (maxColCount - 1)) : 8;
    const unit = Math.max(0, plot.height - vGap * (maxColCount - 1)) / maxColVal;

    // The first column largest first; each next one in the order of where
    // its flows come from, so ribbons cross as little as they can.
    const centre = (n: Node) => n.y + n.h / 2;
    columns.forEach((col, depth) => {
      if (depth === 0) col.sort((a, b) => Math.max(b.inflow, b.outflow) - Math.max(a.inflow, a.outflow));
      else {
        const from = new Map<string, number>();
        for (const n of col) {
          const ins = links.filter((l) => l.to === n.id);
          const w = ins.reduce((s, l) => s + l.weight, 0);
          from.set(n.id, w > 0 ? ins.reduce((s, l) => s + centre(node(l.from)) * l.weight, 0) / w : Infinity);
        }
        col.sort((a, b) => from.get(a.id)! - from.get(b.id)!);
      }
      const colH = col.reduce((s, n) => s + Math.max(n.inflow, n.outflow) * unit, 0) + vGap * (col.length - 1);
      let y = plot.y + Math.max(0, (plot.height - colH) / 2); // centre shorter columns vertically
      for (const n of col) {
        n.h = Math.max(1, Math.max(n.inflow, n.outflow) * unit);
        n.x = plot.x + n.depth * colWidth;
        n.y = y;
        y += n.h + vGap;
      }
    });

    // Links (behind nodes) — same `unit` scale, so they stack to fill node
    // edges, each node's in the order of the node at their other end.
    const outOff = new Map<string, number>(), inOff = new Map<string, number>();
    const outOrder = [...links].sort((a, b) => centre(node(a.to)) - centre(node(b.to)));
    const inOrder = [...links].sort((a, b) => centre(node(a.from)) - centre(node(b.from)));
    const startAt = new Map<Link, number>(), endAt = new Map<Link, number>();
    for (const l of outOrder) { const o = outOff.get(l.from) ?? 0; startAt.set(l, o); outOff.set(l.from, o + l.weight * unit); }
    for (const l of inOrder) { const o = inOff.get(l.to) ?? 0; endAt.set(l, o); inOff.set(l.to, o + l.weight * unit); }
    for (const l of links) {
      const s = node(l.from), t = node(l.to);
      const th = l.weight * unit;
      const y1 = s.y + startAt.get(l)! + th / 2, y2 = t.y + endAt.get(l)! + th / 2;
      const x1 = s.x + nodeW, x2 = t.x;
      const mx = (x1 + x2) / 2;
      const path = renderer.create('path', {
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        fill: 'none', stroke: alpha(s.color, 0.4), 'stroke-width': Math.max(1, th), class: 'facet-point',
      }, g);
      ctx.registerHover(path, l.point);
      path.addEventListener('click', (e: Event) => ctx.onPointEvent('click', l.point, e));
      path.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', l.point, e));
      path.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', l.point, e));
    }

    // Nodes + labels.
    for (const n of nodes.values()) {
      renderer.create('rect', { x: n.x, y: n.y, width: nodeW, height: n.h, fill: n.color, rx: 2 }, g);
      const leftSide = n.depth < maxDepth / 2;
      // A node too thin for a line of text gets no label.
      if (n.h + vGap < 11) continue;
      renderer.text(n.id, leftSide ? n.x + nodeW + 4 : n.x - 4, n.y + n.h / 2, {
        'text-anchor': leftSide ? 'start' : 'end', 'dominant-baseline': 'middle', ...FONTS.axisLabel,
      }, g);
    }
  }
}
