/**
 * Treegraph series. A hierarchy given as flat `{ id, parent, name }` points is
 * laid out left-to-right: depth maps to columns, leaf order to rows, and each
 * internal node is centred on its children. Links are drawn as smooth curves.
 * Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import type { Point } from '../core/point.js';

interface Node { point: Point; id: string; depth: number; y: number; children: Node[]; }

export class TreegraphSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-treegraph ${this.name}` }, renderer.root);

    const byId = new Map<string, Node>();
    for (const p of this.points) {
      const id = String(p.options.id ?? p.name ?? p.x);
      byId.set(id, { point: p, id, depth: 0, y: 0, children: [] });
    }
    const roots: Node[] = [];
    for (const n of byId.values()) {
      const parent = n.point.options.parent ? byId.get(String(n.point.options.parent)) : undefined;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    if (!roots.length) return;

    // Assign depth (column) and leaf-order y (row) via DFS.
    let leaf = 0;
    let maxDepth = 0;
    const visit = (n: Node, depth: number): number => {
      n.depth = depth;
      maxDepth = Math.max(maxDepth, depth);
      if (!n.children.length) { n.y = leaf++; return n.y; }
      const ys = n.children.map((c) => visit(c, depth + 1));
      n.y = ys.reduce((a, b) => a + b, 0) / ys.length;
      return n.y;
    };
    roots.forEach((r) => visit(r, 0));

    const leaves = Math.max(1, leaf);
    const colGap = plot.width / (maxDepth + 1);
    const rowGap = plot.height / leaves;
    const nodeX = (d: number) => plot.x + d * colGap + 8;
    const nodeY = (y: number) => plot.y + (y + 0.5) * rowGap;
    const boxW = Math.min(colGap - 24, 120);
    const boxH = Math.min(rowGap * 0.6, 26);

    // Links first (behind nodes).
    for (const n of byId.values()) {
      for (const c of n.children) {
        const x1 = nodeX(n.depth) + boxW, y1 = nodeY(n.y);
        const x2 = nodeX(c.depth), y2 = nodeY(c.y);
        const mx = (x1 + x2) / 2;
        renderer.create('path', { d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, fill: 'none', stroke: '#c4ccd8', 'stroke-width': 1.5 }, g);
      }
    }

    // Nodes.
    let ci = 0;
    for (const n of byId.values()) {
      const x = nodeX(n.depth), y = nodeY(n.y);
      const color = n.point.color ?? paletteColor(colors, n.depth === 0 ? 0 : ci++);
      const box = renderer.group({ class: 'facet-point' }, g);
      renderer.create('rect', { x, y: y - boxH / 2, width: boxW, height: boxH, rx: 5, fill: color }, box);
      renderer.text(String(n.point.name ?? n.id), x + boxW / 2, y, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel, fill: '#ffffff', 'font-size': '11px',
      }, box);
      ctx.registerHover(box, n.point);
      box.addEventListener('click', (e: Event) => ctx.onPointEvent('click', n.point, e));
      box.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', n.point, e));
      box.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', n.point, e));
    }
  }
}
