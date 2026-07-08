/**
 * Multi-tier ("nested") category x-axis — the hierarchical axis Tableau draws
 * when two or more dimensions sit on the columns shelf.
 *
 * Given the ordered leaf combinations (each an array of dimension values) and a
 * {@link CategoryScale} placing those leaves, this renders one label row per
 * dimension level with divider lines separating the outer groups:
 *
 *      Tech   Furniture  │  Tech   Furniture     ← inner dimension (row 0)
 *   ────────────────────────────────────────
 *          East          │        West           ← outer dimension (row 1)
 */

import type { Renderer } from './renderer.js';
import type { CategoryScale } from './scale.js';
import type { Rect } from './axis.js';
import { FONTS, LAYOUT } from './defaults.js';

export interface NestedAxisConfig {
  renderer: Renderer;
  scale: CategoryScale;
  plot: Rect;
  /** Ordered leaf combinations; each is one value per dimension level. */
  leaves: string[][];
  /** The unique category keys the scale was built from (parallel to leaves). */
  keys: string[];
  lineColor?: string;
  /**
   * Tier placement:
   *  - `bottom` (default): all tiers stacked below the plot.
   *  - `top`: all tiers stacked above the plot.
   *  - `split`: innermost dimension labelled at the bottom, outer grouping
   *    dimensions on top, with full-height lines separating the top-level groups.
   */
  position?: 'bottom' | 'top' | 'split';
}

interface Segment {
  label: string;
  startLeaf: number;
  endLeaf: number;
}

export class NestedAxis {
  constructor(private cfg: NestedAxisConfig) {}

  render(parent: SVGGElement): void {
    const g = this.cfg.renderer.group({ class: 'jchart-axis jchart-axis-nested' }, parent);
    if (this.cfg.position === 'split') this.renderSplit(g);
    else this.renderStacked(g, this.cfg.position === 'top');
  }

  /** All tiers on one side (below or above the plot). */
  private renderStacked(g: SVGGElement, top: boolean): void {
    const { renderer, scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? '#ccd6eb';
    const levels = leaves[0]?.length ?? 0;
    const dir = top ? -1 : 1; // +1 grows rows downward, -1 upward
    const baseY = top ? plot.y : plot.y + plot.height;
    const rowH = 18;
    const leafCenter = (i: number) => scale.scale(keys[i]);

    renderer.create('line', { x1: plot.x, y1: baseY, x2: plot.x + plot.width, y2: baseY, stroke: color }, g);

    for (let level = levels - 1; level >= 0; level--) {
      const row = levels - 1 - level; // 0 = innermost
      const rowStart = baseY + dir * (LAYOUT.tickLength + row * rowH);
      const segments = this.segmentsForLevel(leaves, level);
      const labelY = rowStart + dir * 12;

      for (const seg of segments) {
        const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        renderer.text(seg.label, cx, labelY, {
          'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': level === 0 ? '600' : '400',
        }, g);
      }

      if (level < levels - 1) {
        const bandHalf = scale.fullStep() / 2;
        for (let s = 1; s < segments.length; s++) {
          const bx = leafCenter(segments[s].startLeaf) - bandHalf;
          renderer.create('line', { x1: bx, y1: baseY, x2: bx, y2: rowStart + dir * rowH, stroke: color, 'stroke-width': 1 }, g);
        }
      }
    }
  }

  /**
   * Split layout: innermost dimension as normal labels at the bottom, outer
   * grouping dimensions stacked on top, and full-height vertical lines
   * separating each top-level group.
   */
  private renderSplit(g: SVGGElement): void {
    const { renderer, scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? '#ccd6eb';
    const levels = leaves[0]?.length ?? 0;
    const rowH = 18;
    const leafCenter = (i: number) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;
    const bottomY = plot.y + plot.height;

    // Bottom axis line + innermost dimension labels.
    renderer.create('line', { x1: plot.x, y1: bottomY, x2: plot.x + plot.width, y2: bottomY, stroke: color }, g);
    for (const seg of this.segmentsForLevel(leaves, levels - 1)) {
      const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
      renderer.text(seg.label, cx, bottomY + LAYOUT.tickLength + 12, {
        'text-anchor': 'middle', ...FONTS.axisLabel,
      }, g);
    }

    // Outer grouping dimensions on top (outermost furthest up).
    for (let level = levels - 2; level >= 0; level--) {
      const rowFromTop = levels - 2 - level; // 0 = closest to the plot
      const labelY = plot.y - LAYOUT.tickLength - rowFromTop * rowH - 4;
      for (const seg of this.segmentsForLevel(leaves, level)) {
        const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        renderer.text(seg.label, cx, labelY, {
          'text-anchor': 'middle', ...FONTS.axisLabel, 'font-weight': level === 0 ? '600' : '400',
        }, g);
      }
    }

    // Full-height separators between the top-level (outermost) groups.
    const topExtent = plot.y - LAYOUT.tickLength - (levels - 1) * rowH;
    const outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      const bx = leafCenter(outer[s].startLeaf) - bandHalf;
      renderer.create('line', { x1: bx, y1: topExtent, x2: bx, y2: bottomY, stroke: color, 'stroke-width': 1 }, g);
    }
  }

  /** Contiguous runs of leaves sharing the same prefix up to `level`. */
  private segmentsForLevel(leaves: string[][], level: number): Segment[] {
    const segments: Segment[] = [];
    const prefixKey = (leaf: string[]) => leaf.slice(0, level + 1).join('\u0000');
    let start = 0;
    for (let i = 1; i <= leaves.length; i++) {
      if (i === leaves.length || prefixKey(leaves[i]) !== prefixKey(leaves[start])) {
        segments.push({ label: leaves[start][level], startLeaf: start, endLeaf: i - 1 });
        start = i;
      }
    }
    return segments;
  }
}
