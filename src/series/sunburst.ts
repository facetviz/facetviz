/**
 * Sunburst — a multi-level radial hierarchy. Nodes are given as flat
 * `{ id, parent, name, value }`; leaf values roll up to their ancestors. Each
 * ring is a depth level; a node's angular span is its share of its parent, and
 * children are nested within that span. Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, shade } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import type { Point } from '../core/point.js';

interface Node { point?: Point; id: string; name: string; value: number; depth: number; children: Node[]; color?: string; }

export class SunburstSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-sunburst ${this.name}` }, renderer.root);

    // Build the tree.
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
    const root: Node = roots.length === 1 ? roots[0] : { id: '__root', name: '', value: 0, depth: -1, children: roots };
    const rollup = (n: Node): number => {
      if (n.children.length) n.value = n.children.reduce((s, c) => s + rollup(c), 0);
      return n.value;
    };
    rollup(root);
    if (root.value <= 0) return;

    let maxDepth = 0;
    const setDepth = (n: Node, d: number) => { n.depth = d; maxDepth = Math.max(maxDepth, d); n.children.forEach((c) => setDepth(c, d + 1)); };
    root.children.forEach((c) => setDepth(c, 0));

    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const R = Math.min(plot.width, plot.height) / 2 - 6;
    const ringW = R / (maxDepth + 1);

    const draw = (n: Node, a0: number, a1: number, ci: number) => {
      if (n.depth >= 0) {
        const rIn = n.depth * ringW;
        // Leaf nodes fill the remaining rings out to the edge so they read as
        // complete wedges instead of a thin inner sliver.
        const rOut = n.children.length ? (n.depth + 1) * ringW : R;
        const base = n.color ?? paletteColor(colors, ci);
        const color = n.point?.color ?? shade(base, n.depth * 0.12);
        const el = renderer.create('path', {
          d: this.arc(cx, cy, rIn, rOut, a0, a1), fill: color, stroke: '#fff', 'stroke-width': 1, class: 'facet-point',
        }, g);
        if (n.point) {
          ctx.registerHover(el, n.point);
          el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', n.point!, e));
          el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', n.point!, e));
          el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', n.point!, e));
        }
        // Label if the slice is roomy.
        if (a1 - a0 > 0.18 && rOut - rIn > 14) {
          const mid = (a0 + a1) / 2, rMid = (rIn + rOut) / 2;
          renderer.text(n.name, cx + rMid * Math.cos(mid), cy + rMid * Math.sin(mid), {
            'text-anchor': 'middle', 'dominant-baseline': 'middle', ...FONTS.dataLabel, fill: '#fff', 'font-size': '10px',
          }, g);
        }
      }
      let a = a0;
      n.children.forEach((c, i) => {
        const span = (c.value / n.value) * (a1 - a0);
        draw(c, a, a + span, n.depth < 0 ? i : ci);
        a += span;
      });
    };
    draw(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0);
  }

  private arc(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    if (rIn <= 0) {
      return `M ${cx} ${cy} L ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} Z`;
    }
    return `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)} Z`;
  }
}
