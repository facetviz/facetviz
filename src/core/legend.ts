/**
 * Renders the legend as SVG and reports item clicks so the chart can toggle
 * series (or slice) visibility.
 *
 * Two layouts:
 *   - `horizontal` — a wrapping row of swatch + label items (top or bottom).
 *   - `vertical`   — a stacked column of items (left or right side).
 */

import type { Renderer } from './renderer.js';
import type { LegendOptions } from './options.js';
import { FONTS } from './defaults.js';

export interface LegendItem {
  label: string;
  color: string;
  visible: boolean;
}

export interface LegendConfig {
  renderer: Renderer;
  items: LegendItem[];
  options: LegendOptions;
  /** Bounding box the legend is laid out within. */
  x: number;
  y: number;
  width: number;
  height: number;
  layout: 'horizontal' | 'vertical';
  onToggle: (index: number) => void;
}

const SWATCH = 12;
const CHAR_W = 7; // rough per-character label width estimate
const ITEM_GAP = 18;
const ROW_H = 20;

export class Legend {
  constructor(private cfg: LegendConfig) {}

  /** Estimated width of a vertical legend column (for space reservation). */
  static verticalWidth(items: LegendItem[]): number {
    const longest = items.reduce((m, it) => Math.max(m, it.label.length), 0);
    return SWATCH + 8 + longest * CHAR_W + 8;
  }

  render(parent: SVGGElement): void {
    if (this.cfg.options.enabled === false || !this.cfg.items.length) return;
    const g = this.cfg.renderer.group({ class: 'jchart-legend' }, parent);
    if (this.cfg.layout === 'vertical') this.renderVertical(g);
    else this.renderHorizontal(g);
  }

  private drawItem(g: SVGGElement, it: LegendItem, index: number, x: number, y: number): void {
    const { renderer, onToggle } = this.cfg;
    const item = renderer.group({ class: 'jchart-legend-item', style: 'cursor:pointer' }, g);
    renderer.create('rect', {
      x, y, width: SWATCH, height: SWATCH, rx: 2,
      fill: it.visible ? it.color : '#cccccc',
    }, item);
    const label = renderer.text(it.label, x + SWATCH + 6, y + SWATCH - 2, {
      ...FONTS.legend,
      fill: it.visible ? FONTS.legend.fill : '#999',
      'text-decoration': it.visible ? 'none' : 'line-through',
    }, item);
    label.style.userSelect = 'none';
    item.addEventListener('click', () => onToggle(index));
  }

  private renderHorizontal(g: SVGGElement): void {
    const { items, options, width, x: originX, y } = this.cfg;
    const widths = items.map((it) => SWATCH + 6 + it.label.length * CHAR_W + ITEM_GAP);

    // Wrap items into rows that fit the available width.
    const rows: number[][] = [[]];
    let rowWidth = 0;
    widths.forEach((w, i) => {
      if (rowWidth + w > width && rows[rows.length - 1].length) {
        rows.push([]);
        rowWidth = 0;
      }
      rows[rows.length - 1].push(i);
      rowWidth += w;
    });

    rows.forEach((row, r) => {
      const totalW = row.reduce((s, i) => s + widths[i], 0);
      let startX = originX;
      if (options.align === 'right') startX = originX + width - totalW;
      else if (options.align !== 'left') startX = originX + (width - totalW) / 2;

      let cx = startX;
      const rowY = y + r * ROW_H;
      for (const i of row) {
        this.drawItem(g, items[i], i, cx, rowY);
        cx += widths[i];
      }
    });
  }

  private renderVertical(g: SVGGElement): void {
    const { items, x, y } = this.cfg;
    items.forEach((it, i) => this.drawItem(g, it, i, x, y + i * ROW_H));
  }
}
