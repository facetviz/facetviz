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
import { THEME } from './theme.js';
import { sanitizeStyle } from './utils.js';

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
const LABEL_GAP = 6;
const ITEM_GAP = 18;
const ROW_GAP = 6;
const HORIZONTAL_PADDING = 14;
const CHAR_WIDTH_RATIO = 0.6;

interface LegendMetrics {
  charWidth: number;
  lineHeight: number;
  rowHeight: number;
}

export class Legend {
  constructor(private cfg: LegendConfig) {}

  private static metrics(options: LegendOptions): LegendMetrics {
    const style = sanitizeStyle(options.itemStyle);
    const fontSize = parseFloat(style['font-size'] ?? FONTS.legend['font-size'] ?? '12') || 12;
    const lineHeight = Math.max(SWATCH, fontSize * 1.2);
    return {
      charWidth: fontSize * CHAR_WIDTH_RATIO,
      lineHeight,
      rowHeight: lineHeight + ROW_GAP,
    };
  }

  private static itemWidths(
    items: LegendItem[],
    options: LegendOptions,
  ): number[] {
    const { charWidth } = Legend.metrics(options);
    return items.map(
      (it) => SWATCH + LABEL_GAP + it.label.length * charWidth + ITEM_GAP,
    );
  }

  private static rows(
    items: LegendItem[],
    width: number,
    options: LegendOptions,
  ): number[][] {
    const rows: number[][] = [[]];
    let rowWidth = 0;
    Legend.itemWidths(items, options).forEach((itemWidth, index) => {
      if (rowWidth + itemWidth > width && rows[rows.length - 1].length) {
        rows.push([]);
        rowWidth = 0;
      }
      rows[rows.length - 1].push(index);
      rowWidth += itemWidth;
    });
    return rows;
  }

  /** Height needed for a wrapping horizontal legend. */
  static horizontalHeight(
    items: LegendItem[],
    width: number,
    options: LegendOptions,
  ): number {
    return HORIZONTAL_PADDING +
      Legend.rows(items, width, options).length * Legend.metrics(options).rowHeight;
  }

  /** Estimated width of a vertical legend column (for space reservation). */
  static verticalWidth(items: LegendItem[], options: LegendOptions): number {
    const longest = items.reduce((m, it) => Math.max(m, it.label.length), 0);
    return SWATCH + LABEL_GAP +
      longest * Legend.metrics(options).charWidth + 8;
  }

  render(parent: SVGGElement): void {
    if (this.cfg.options.enabled === false || !this.cfg.items.length) return;
    const g = this.cfg.renderer.group({ class: 'facet-legend' }, parent);
    if (this.cfg.layout === 'vertical') this.renderVertical(g);
    else this.renderHorizontal(g);
  }

  private drawItem(g: SVGGElement, it: LegendItem, index: number, x: number, y: number): void {
    const { renderer, onToggle } = this.cfg;
    const itemStyle = sanitizeStyle(this.cfg.options.itemStyle);
    const { lineHeight } = Legend.metrics(this.cfg.options);
    const visibleFill = itemStyle.fill ?? FONTS.legend.fill;
    const visibleTextDecoration = itemStyle['text-decoration'] ?? 'none';
    const centerY = y + lineHeight / 2;
    const item = renderer.group({ class: 'facet-legend-item', style: 'cursor:pointer' }, g);
    renderer.create('rect', {
      x, y: centerY - SWATCH / 2, width: SWATCH, height: SWATCH, rx: 2,
      fill: it.visible ? it.color : THEME.legend.hiddenColor,
    }, item);
    const label = renderer.text(it.label, x + SWATCH + LABEL_GAP, centerY, {
      ...FONTS.legend,
      ...itemStyle,
      fill: it.visible ? visibleFill : THEME.legend.hiddenColor,
      'text-decoration': it.visible ? visibleTextDecoration : 'line-through',
      'dominant-baseline': itemStyle['dominant-baseline'] ?? 'middle',
    }, item);
    label.style.userSelect = 'none';
    item.addEventListener('click', () => onToggle(index));
  }

  private renderHorizontal(g: SVGGElement): void {
    const { items, options, width, x: originX, y } = this.cfg;
    const widths = Legend.itemWidths(items, options);
    const rows = Legend.rows(items, width, options);
    const { rowHeight } = Legend.metrics(options);

    rows.forEach((row, r) => {
      const totalW = row.reduce((s, i) => s + widths[i], 0);
      let startX = originX;
      if (options.align === 'right') startX = originX + width - totalW;
      else if (options.align !== 'left') startX = originX + (width - totalW) / 2;

      let cx = startX;
      const rowY = y + r * rowHeight;
      for (const i of row) {
        this.drawItem(g, items[i], i, cx, rowY);
        cx += widths[i];
      }
    });
  }

  private renderVertical(g: SVGGElement): void {
    const { items, options, x, y } = this.cfg;
    const { rowHeight } = Legend.metrics(options);
    items.forEach((it, i) => this.drawItem(g, it, i, x, y + i * rowHeight));
  }
}
