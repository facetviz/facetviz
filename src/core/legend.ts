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
const DEFAULT_SYMBOL_PADDING = 6;
const DEFAULT_ITEM_GAP = 18;
const DEFAULT_ROW_GAP = 6;
/**
 * The legacy legend layout used different content-side gaps for each
 * placement. Keep those values as contextual defaults while allowing callers
 * to replace them with `legend.margin`.
 */
const DEFAULT_TOP_MARGIN = 10;
const DEFAULT_BOTTOM_MARGIN = 22;
const DEFAULT_SIDE_MARGIN = 8;
/** Fixed leading inset that preserves the established top-legend baseline. */
export const TOP_LEGEND_INSET = 12;
const CHAR_WIDTH_RATIO = 0.6;

export type LegendPlacement = 'top' | 'bottom' | 'left' | 'right';

const nonNegative = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

export const legendPadding = (options: LegendOptions): number =>
  nonNegative(options.padding, 0);

export const legendMargin = (
  options: LegendOptions,
  placement: LegendPlacement,
  spacingScale = 1,
): number =>
  nonNegative(
    options.margin,
    (placement === 'top'
      ? DEFAULT_TOP_MARGIN
      : placement === 'bottom'
        ? DEFAULT_BOTTOM_MARGIN
        : DEFAULT_SIDE_MARGIN) * spacingScale,
  );

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
      rowHeight: lineHeight + nonNegative(options.rowGap, DEFAULT_ROW_GAP),
    };
  }

  private static itemWidths(
    items: LegendItem[],
    options: LegendOptions,
  ): number[] {
    const { charWidth } = Legend.metrics(options);
    const symbolPadding = nonNegative(
      options.symbolPadding,
      DEFAULT_SYMBOL_PADDING,
    );
    const itemGap = nonNegative(options.itemGap, DEFAULT_ITEM_GAP);
    return items.map(
      (it) => SWATCH + symbolPadding + it.label.length * charWidth + itemGap,
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
    placement: LegendPlacement,
    spacingScale = 1,
  ): number {
    const padding = legendPadding(options);
    const contentWidth = Math.max(0, width - padding * 2);
    const inset = placement === 'top' ? TOP_LEGEND_INSET : 0;
    return inset +
      legendMargin(options, placement, spacingScale) +
      padding * 2 +
      Legend.rows(items, contentWidth, options).length *
        Legend.metrics(options).rowHeight;
  }

  /** Estimated width of a vertical legend column (for space reservation). */
  static verticalWidth(
    items: LegendItem[],
    options: LegendOptions,
    placement: LegendPlacement,
    spacingScale = 1,
  ): number {
    const longest = items.reduce((m, it) => Math.max(m, it.label.length), 0);
    const symbolPadding = nonNegative(
      options.symbolPadding,
      DEFAULT_SYMBOL_PADDING,
    );
    return SWATCH + symbolPadding +
      longest * Legend.metrics(options).charWidth +
      legendPadding(options) * 2 +
      legendMargin(options, placement, spacingScale);
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
    const symbolPadding = nonNegative(
      this.cfg.options.symbolPadding,
      DEFAULT_SYMBOL_PADDING,
    );
    const { lineHeight } = Legend.metrics(this.cfg.options);
    const visibleFill = itemStyle.fill ?? FONTS.legend.fill;
    const visibleTextDecoration = itemStyle['text-decoration'] ?? 'none';
    const centerY = y + lineHeight / 2;
    const item = renderer.group({ class: 'facet-legend-item', style: 'cursor:pointer' }, g);
    renderer.create('rect', {
      x, y: centerY - SWATCH / 2, width: SWATCH, height: SWATCH, rx: 2,
      fill: it.visible ? it.color : THEME.legend.hiddenColor,
    }, item);
    const label = renderer.text(it.label, x + SWATCH + symbolPadding, centerY, {
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
    const padding = legendPadding(options);
    const contentWidth = Math.max(0, width - padding * 2);
    const widths = Legend.itemWidths(items, options);
    const rows = Legend.rows(items, contentWidth, options);
    const { rowHeight } = Legend.metrics(options);

    rows.forEach((row, r) => {
      const totalW = row.reduce((s, i) => s + widths[i], 0);
      let startX = originX + padding;
      if (options.align === 'right')
        startX = originX + padding + contentWidth - totalW;
      else if (options.align !== 'left')
        startX = originX + padding + (contentWidth - totalW) / 2;

      let cx = startX;
      const rowY = y + padding + r * rowHeight;
      for (const i of row) {
        this.drawItem(g, items[i], i, cx, rowY);
        cx += widths[i];
      }
    });
  }

  private renderVertical(g: SVGGElement): void {
    const { items, options, x, y } = this.cfg;
    const padding = legendPadding(options);
    const { rowHeight } = Legend.metrics(options);
    items.forEach((it, i) =>
      this.drawItem(g, it, i, x + padding, y + padding + i * rowHeight),
    );
  }
}
