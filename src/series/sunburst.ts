/**
 * Sunburst — a multi-level radial hierarchy. Nodes are given as flat
 * `{ id, parent, name, value }`; leaf values roll up to their ancestors. Each
 * ring is a depth level; a node's angular span is its share of its parent, and
 * children are nested within that span. Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import { paletteColor, shade, textOn } from '../core/colors.js';
import { FONTS } from '../core/defaults.js';
import { scaledFontPx } from '../core/theme.js';
import { roundedSectorPath } from './polar.js';
import type { Point } from '../core/point.js';

interface Node { point?: Point; id: string; name: string; value: number; depth: number; children: Node[]; color?: string; }

/** `name` cut with … to fit `room` px; null when not even three letters fit. */
function fitName(name: string, room: number, width: (t: string) => number): string | null {
  if (width(name) <= room) return name;
  let cut = name;
  while (cut.length > 2 && width(`${cut}…`) > room) cut = cut.slice(0, -1);
  return cut.length > 2 ? `${cut.trimEnd()}…` : null;
}

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
    // Always under a hidden root, so a lone top-level piece is the first ring
    // (not drawn over by its own children) and its children get their own
    // colours.
    const root: Node = { id: '__root', name: '', value: 0, depth: -1, children: roots };
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
          d: this.arc(cx, cy, rIn, rOut, a0, a1), fill: color, stroke: ctx.background ?? '#fff', 'stroke-width': 1, class: 'facet-point',
        }, g);
        if (n.point) {
          ctx.registerHover(el, n.point);
          el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', n.point!, e));
          el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', n.point!, e));
          el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', n.point!, e));
        }
        // Label if the slice is roomy and the chart itself isn't too small
        // for data-style labels (see `Chart.suppressDataLabels`).
        if (!ctx.suppressDataLabels && a1 - a0 > 0.18 && rOut - rIn > 14) {
          const mid = (a0 + a1) / 2, rMid = (rIn + rOut) / 2;
          const style = { ...FONTS.dataLabel, 'font-size': scaledFontPx(10) };
          // As wide as the piece's arc (or the full circle's width), and no
          // wider than its ring is deep when it runs across the ring: cut
          // with … to fit, left out with no room for three letters.
          const room = Math.min((a1 - a0) * rMid, 2 * rMid) * 0.86;
          const text = fitName(n.name, room, (t) => renderer.measureText(t, style).width);
          if (text) {
            renderer.text(text, cx + rMid * Math.cos(mid), cy + rMid * Math.sin(mid), {
              'text-anchor': 'middle', 'dominant-baseline': 'middle', ...style, fill: textOn(color),
            }, g);
          }
        }
      }
      let a = a0;
      n.children.forEach((c, i) => {
        const span = (c.value / n.value) * (a1 - a0);
        // Each top-level piece takes its own colour; with only one, its
        // pieces do (else the whole chart is shades of one colour).
        const own = n.depth < 0 || (n.depth === 0 && root.children.length === 1);
        draw(c, a, a + span, own ? i : ci);
        a += span;
      });
    };
    draw(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0);
  }

  private arc(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
    const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    // A whole turn starts and ends on the same point, which an SVG arc draws
    // as nothing: draw it as two halves.
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
      const half = a0 + Math.PI;
      const ring = (r: number, sweep: 0 | 1, from: number, mid: number, to: number) =>
        `${p(r, from)} A ${r} ${r} 0 0 ${sweep} ${p(r, mid)} A ${r} ${r} 0 0 ${sweep} ${p(r, to)}`;
      const outer = `M ${ring(rOut, 1, a0, half, a0)} Z`;
      return rIn <= 0 ? outer : `${outer} M ${ring(rIn, 0, a0, half, a0)} Z`;
    }
    const rounded = roundedSectorPath(cx, cy, rIn, rOut, a0, a1, this.options.borderRadius ?? 0);
    if (rounded) return rounded;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    if (rIn <= 0) {
      return `M ${cx} ${cy} L ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} Z`;
    }
    return `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)} Z`;
  }
}
