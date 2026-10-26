/**
 * Draws the header side of a canvas laid out with {@link layoutCanvas}: the
 * category labels along the panes' axis band, every header level as its own
 * object (one text per cell, `data-fv-kind="header"`, its field and path),
 * the dividers between groups, banding and the field labels. Across columns
 * the levels sit below the panes (`bottom`) or above them (`top`, the split
 * look: categories below, groups on top); down rows, left or right.
 *
 *          │▒▒▒▒▒▒▒▒│        │▒▒▒▒▒▒▒▒│        ← banding by a level's groups
 *   ───────┼────────┼────────┼────────┼──────   baseline
 *     Q1      Q2    │  Q1       Q2             ← categories (axis band)
 *         East      │      West                ← header level (Region)
 *                   └ divider through panes and the levels it separates
 */

import type { Renderer, Attrs } from "./renderer.js";
import type { Rect } from "./axis.js";
import { markAxisParts } from "./axis.js";
import type { CanvasLayout, CanvasPlacedCell } from "./canvas-layout.js";
import type { AxisOptions, CanvasOptions, CanvasHeaderOptions } from "./options.js";
import { FONTS, LAYOUT } from "./defaults.js";
import { THEME } from "./theme.js";
import { formatString, sanitizeStyle } from "./utils.js";

/** Extra separation between successive grouping levels on a split header side. */
export const SPLIT_TIER_GAP = 6;
/** Height of each grouping level above the panes on a split header side. */
export const SPLIT_TIER_PITCH = 18 + SPLIT_TIER_GAP;
/** Height of each level below the panes. */
export const TIER_HEIGHT = 18;

/**
 * Estimated px width each level needs for its widest label: down rows the
 * levels are columns, each as wide as its longest value.
 */
export function tierWidths(leaves: string[][]): number[] {
  const levels = leaves[0]?.length ?? 0;
  const widths: number[] = [];
  for (let level = 0; level < levels; level++) {
    let maxLen = 0;
    for (const leaf of leaves) maxLen = Math.max(maxLen, (leaf[level] ?? "").length);
    widths[level] = Math.max(40, maxLen * 6.6 + 12);
  }
  return widths;
}

/** Extra height the category labels need when rotated. */
export function categoryRotationExtent(leaves: string[][], rotation: number): number {
  if (!rotation) return 0;
  const maxLen = leaves.reduce((m, l) => Math.max(m, String(l[l.length - 1] ?? "").length), 0);
  return Math.abs(Math.sin((rotation * Math.PI) / 180)) * (maxLen * 6.2 + 6);
}

export interface HeaderTiersConfig {
  renderer: Renderer;
  /** The category axis's canvas address, e.g. `xAxis[0]`. */
  id: string;
  layout: CanvasLayout;
  /** Header cells of the track drawn here (layout.headers.columns or .rows). */
  cells: CanvasPlacedCell[][];
  /** Header fields, outer first, then the category field last. */
  fields: string[];
  /** Every category in order across the panes: its header values, then its own. */
  leaves: string[][];
  /** Centre of category `i` along the track, and the step between categories. */
  leafCenter: (i: number) => number;
  step: number;
  plot: Rect;
  /** Levels run down rows (a horizontal bar chart) rather than across columns. */
  vertical: boolean;
  /** Levels beyond the panes on the far side (top / right) from the categories. */
  split: boolean;
  axis: AxisOptions;
  canvas: CanvasOptions;
  spacingScale: number;
}

interface Boundary {
  /** First category after the boundary. */
  leaf: number;
  /** Outermost level that changes there (fields.length - 1 = the category). */
  level: number;
}

export class HeaderTiers {
  constructor(private cfg: HeaderTiersConfig) {}

  private get levels(): number {
    return this.cfg.fields.length;
  }

  private get labelsOn(): boolean {
    return this.cfg.axis.labels?.enabled !== false;
  }

  private get labelOffset(): number {
    if (!this.labelsOn) return 0;
    const value = this.cfg.axis.labels?.offset;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private get color(): string {
    return this.dividers.color ?? this.cfg.axis.lineColor ?? THEME.axis.lineColor;
  }

  private get dividers() {
    const d = this.cfg.vertical ? this.cfg.canvas.dividers?.rows : this.cfg.canvas.dividers?.columns;
    return d ?? {};
  }

  /** Whether a boundary changing at `level` gets a divider. */
  private divides(level: number): boolean {
    const want = this.dividers.level ?? this.cfg.axis.groupLines ?? "groups";
    if (want === "none") return false;
    if (want === "all") return true;
    const deepest = this.levels - 2; // the innermost header level
    return level <= (typeof want === "number" ? Math.min(want, deepest) : deepest);
  }

  /** The plot, never negative: a chart squeezed by its bands fills nothing. */
  private get clampedPlot(): Rect {
    const p = this.cfg.plot;
    return { ...p, width: Math.max(0, p.width), height: Math.max(0, p.height) };
  }

  private header(level: number): CanvasHeaderOptions {
    return this.cfg.canvas.headers?.[this.cfg.fields[level]] ?? {};
  }

  render(parent: SVGGElement): SVGGElement {
    this.drawAlternateLeafBands(parent);
    this.drawBanding(parent);
    const g = this.cfg.renderer.group({ class: "facet-axis facet-axis-nested" }, parent);
    this.drawLeafGridlines(g);
    if (this.cfg.vertical) this.renderVertical(g);
    else this.renderHorizontal(g);
    this.drawFieldLabels(g);
    const title = this.drawTitle(g);
    markAxisParts(g, this.cfg.id, undefined, title ? [title] : []);
    return g;
  }

  // -- Text ----------------------------------------------------------------

  private format(text: string, level: number): string {
    const own = this.header(level).label?.format;
    if (own) return formatString(own, { value: text });
    const labels = this.cfg.axis.labels;
    return String(
      labels?.formatter ? labels.formatter(text) : labels?.format ? formatString(labels.format, { value: text }) : text,
    );
  }

  /** A label of `level`; none when labels are off. */
  private text(text: string, level: number, x: number, y: number, attrs: Attrs, g: SVGGElement): SVGTextElement | undefined {
    if (!this.labelsOn) return undefined;
    return this.cfg.renderer.text(this.format(text, level), x, y, {
      ...FONTS.axisLabel,
      "font-weight": level === 0 ? "600" : "400",
      ...attrs,
      ...sanitizeStyle(this.cfg.axis.labels?.style),
      ...sanitizeStyle(this.header(level).label?.style),
    }, g);
  }

  /** A header cell's label, marked as that level's header with its path. */
  private headerText(placed: CanvasPlacedCell, level: number, x: number, y: number, attrs: Attrs, g: SVGGElement): void {
    const bg = this.header(level).background;
    if (bg) this.cfg.renderer.create("rect", { ...placed.rect, fill: bg, class: "facet-header-background", ...this.headerMark(placed, level) }, g);
    const el = this.text(String(placed.cell.value ?? ""), level, x, y, attrs, g);
    if (!el) return;
    for (const [k, v] of Object.entries(this.headerMark(placed, level))) el.setAttribute(k, v);
    const rotation = this.header(level).label?.rotation;
    if (rotation) el.setAttribute("transform", `rotate(${rotation} ${x} ${y})`);
  }

  private headerMark(placed: CanvasPlacedCell, level: number): Record<string, string> {
    return {
      "data-fv-kind": "header",
      "data-fv-id": this.cfg.fields[level],
      "data-fv-path": placed.cell.path.map((v) => v ?? "").join("\u001f"),
    };
  }

  private line(attrs: Attrs, g: SVGGElement): void {
    if (this.cfg.axis.lineWidth === 0) return;
    this.cfg.renderer.create("line", attrs, g);
  }

  private divider(a: { x1: number; y1: number; x2: number; y2: number }, g: SVGGElement): void {
    if (a.x1 === a.x2 && a.y1 === a.y2) return;
    this.line({
      ...a,
      stroke: this.color,
      "stroke-width": this.dividers.width ?? 1,
      "stroke-dasharray": this.dividers.dashStyle,
      class: "facet-nested-group-separator",
    }, g);
  }

  // -- Geometry -------------------------------------------------------------

  /** Boundaries between neighbouring categories and the outermost level changing at each. */
  private boundaries(): Boundary[] {
    const { leaves } = this.cfg;
    const out: Boundary[] = [];
    for (let i = 1; i < leaves.length; i++) {
      const level = leaves[i].findIndex((v, l) => v !== leaves[i - 1][l]);
      if (level >= 0) out.push({ leaf: i, level });
    }
    return out;
  }

  /** Runs of categories sharing their values down to `level`. */
  private runs(level: number): Array<{ label: string; start: number; end: number }> {
    const { leaves } = this.cfg;
    const key = (l: string[]) => l.slice(0, level + 1).join("\u0000");
    const out: Array<{ label: string; start: number; end: number }> = [];
    let start = 0;
    for (let i = 1; i <= leaves.length; i++) {
      if (i === leaves.length || key(leaves[i]) !== key(leaves[start])) {
        out.push({ label: leaves[start][level], start, end: i - 1 });
        start = i;
      }
    }
    return out;
  }

  /**
   * The category labels to draw, every Nth when they'd overlap; the count
   * restarts in each outermost group so every group skips the same ones.
   */
  private thinnedCategories(bandPx: number) {
    const inner = this.runs(this.levels - 1);
    if (bandPx <= 0 || inner.length < 2) return inner;
    const maxLen = inner.reduce((m, s) => Math.max(m, s.label.length), 0);
    const estW = maxLen * 6.2 + 6;
    const step = estW > bandPx ? Math.ceil(estW / bandPx) : 1;
    if (step <= 1) return inner;
    if (this.levels <= 1) return inner.filter((_, i) => i % step === 0);
    const outer = this.runs(0);
    let o = 0;
    return inner.filter((seg) => {
      while (o < outer.length - 1 && seg.start > outer[o].end) o++;
      return (seg.start - outer[o].start) % step === 0;
    });
  }

  /** The cell of header `level` holding category `leaf`. */
  private cellAt(level: number, leaf: number): CanvasPlacedCell | undefined {
    const runIndex = this.runs(level).findIndex((r) => r.start <= leaf && leaf <= r.end);
    return runIndex < 0 ? undefined : this.cfg.cells[level]?.[runIndex];
  }

  /** The edge of a boundary's level farthest from the panes (or the baseline for a category). */
  private boundaryEdge(level: number, leaf: number, base: number): number {
    if (level === this.levels - 1) return base;
    const cell = this.cellAt(level, leaf)?.rect;
    if (!cell) return base;
    const { vertical, split } = this.cfg;
    if (vertical) return split ? cell.x + cell.width : cell.x;
    return split ? cell.y : cell.y + cell.height;
  }

  // -- Across columns ---------------------------------------------------------

  private renderHorizontal(g: SVGGElement): void {
    const { plot, leafCenter, step, split } = this.cfg;
    const baseY = plot.y + plot.height;
    const rotation = this.cfg.axis.labels?.rotation ?? 0;
    this.line({ x1: plot.x, y1: baseY, x2: plot.x + plot.width, y2: baseY, stroke: this.cfg.axis.lineColor ?? THEME.axis.lineColor }, g);

    // Categories, just past the baseline.
    const catLevel = this.levels - 1;
    const labelY = baseY + LAYOUT.tickLength + this.labelOffset + (rotation ? 8 : 12);
    const cats = rotation ? this.runs(catLevel) : this.thinnedCategories(Math.abs(step) * 0.8);
    for (const seg of cats) {
      const cx = (leafCenter(seg.start) + leafCenter(seg.end)) / 2;
      const el = this.text(seg.label, catLevel, cx, labelY, {
        "text-anchor": rotation ? (rotation < 0 ? "end" : "start") : "middle",
      }, g);
      if (rotation && el) el.setAttribute("transform", `rotate(${rotation} ${cx} ${labelY})`);
    }

    // Header levels: below, a row each (label 12 px into it); on top, each
    // label 4 px above its row's bottom.
    this.cfg.cells.forEach((level, l) => {
      if (this.header(l).visible === false) return;
      for (const placed of level) {
        const { rect } = placed;
        const y = split ? rect.y + rect.height - 4 : rect.y + 12;
        this.headerText(placed, l, rect.x + rect.width / 2, y, { "text-anchor": "middle" }, g);
      }
    });

    // Dividers: through the panes and on into the level that changed.
    const half = step / 2;
    for (const b of this.boundaries()) {
      if (!this.divides(b.level)) continue;
      const x = leafCenter(b.leaf) - half;
      if (split) {
        const top = b.level === catLevel ? plot.y : this.boundaryEdge(b.level, b.leaf, plot.y);
        const bottom = b.level === catLevel
          ? baseY
          : baseY + LAYOUT.tickLength + this.labelOffset + 20 + (this.levels - 2 - b.level) * SPLIT_TIER_GAP;
        this.divider({ x1: x, y1: top, x2: x, y2: bottom }, g);
      } else {
        this.divider({ x1: x, y1: plot.y, x2: x, y2: this.boundaryEdge(b.level, b.leaf, baseY) }, g);
      }
    }
  }

  // -- Down rows (horizontal bars) -----------------------------------------

  private renderVertical(g: SVGGElement): void {
    const { plot, leafCenter, step, split, leaves } = this.cfg;
    const baseX = plot.x;
    this.line({ x1: baseX, y1: plot.y, x2: baseX, y2: plot.y + plot.height, stroke: this.cfg.axis.lineColor ?? THEME.axis.lineColor }, g);

    // Categories in the column nearest the panes.
    const catLevel = this.levels - 1;
    const innerW = tierWidths(leaves)[catLevel] ?? 0;
    const catX = baseX - LAYOUT.tickLength - this.labelOffset - innerW / 2;
    for (const seg of this.runs(catLevel)) {
      const cy = (leafCenter(seg.start) + leafCenter(seg.end)) / 2 + 4;
      this.text(seg.label, catLevel, catX, cy, { "text-anchor": "middle" }, g);
    }

    this.cfg.cells.forEach((level, l) => {
      if (this.header(l).visible === false) return;
      for (const placed of level) {
        const { rect } = placed;
        this.headerText(placed, l, rect.x + rect.width / 2, rect.y + rect.height / 2 + 4, { "text-anchor": "middle" }, g);
      }
    });

    // Dividers across the panes, on through the levels that changed.
    const half = step / 2;
    const far = plot.x + plot.width;
    for (const b of this.boundaries()) {
      if (!this.divides(b.level)) continue;
      const y = leafCenter(b.leaf) - half;
      if (b.level === catLevel) {
        this.divider({ x1: far, y1: y, x2: baseX, y2: y }, g);
      } else if (split) {
        const left = baseX - LAYOUT.tickLength - this.labelOffset - innerW;
        this.divider({ x1: left, y1: y, x2: this.boundaryEdge(b.level, b.leaf, far), y2: y }, g);
      } else {
        this.divider({ x1: far, y1: y, x2: this.boundaryEdge(b.level, b.leaf, baseX), y2: y }, g);
      }
    }
  }

  // -- Fills ------------------------------------------------------------------

  /** `xAxis.alternateGridColor`: every other category, behind everything. */
  private drawAlternateLeafBands(parent: SVGGElement): void {
    const color = this.cfg.axis.alternateGridColor;
    if (typeof color !== "string") return;
    const { leafCenter, step, vertical, renderer } = this.cfg;
    const plot = this.clampedPlot;
    const band = renderer.group({ class: "facet-alternate-grid-bands" }, parent);
    parent.insertBefore(band, parent.firstChild);
    const half = Math.abs(step) / 2;
    this.cfg.leaves.forEach((_, i) => {
      if (i % 2 === 0) return;
      const c = leafCenter(i);
      renderer.create("rect", vertical
        ? { x: plot.x, y: c - half, width: plot.width, height: half * 2, fill: color, stroke: "none", class: "facet-alternate-grid-band" }
        : { x: c - half, y: plot.y, width: half * 2, height: plot.height, fill: color, stroke: "none", class: "facet-alternate-grid-band" }, band);
    });
    markAxisParts(band, this.cfg.id);
    band.removeAttribute("data-fv-kind");
  }

  /** `canvas.banding`: every other group of a header level, in the panes and its header cells. */
  private drawBanding(parent: SVGGElement): void {
    const opts = this.cfg.vertical ? this.cfg.canvas.banding?.rows : this.cfg.canvas.banding?.columns;
    if (!opts || (!opts.color && !opts.headerColor) || this.levels < 2) return;
    const level = Math.max(0, Math.min(opts.level ?? this.levels - 2, this.levels - 2));
    const size = Math.max(1, Math.floor(opts.size ?? 1));
    const { vertical, renderer } = this.cfg;
    const plot = this.clampedPlot;
    const band = renderer.group({ class: "facet-canvas-bands" }, parent);
    parent.insertBefore(band, parent.firstChild);
    (this.cfg.cells[level] ?? []).forEach((placed, i) => {
      if (i % (2 * size) < size) return;
      const r = placed.rect;
      if (opts.color)
        renderer.create("rect", vertical
          ? { x: plot.x, y: r.y, width: plot.width, height: r.height, fill: opts.color, class: "facet-canvas-band" }
          : { x: r.x, y: plot.y, width: r.width, height: plot.height, fill: opts.color, class: "facet-canvas-band" }, band);
      if (opts.headerColor)
        renderer.create("rect", { ...r, fill: opts.headerColor, class: "facet-canvas-band facet-canvas-header-band" }, band);
    });
  }

  /** `xAxis.gridLineWidth`: a line through the panes at each category. */
  private drawLeafGridlines(g: SVGGElement): void {
    const width = this.cfg.axis.gridLineWidth;
    if (!width) return;
    const { renderer, plot, leafCenter, vertical } = this.cfg;
    const color = this.cfg.axis.gridLineColor ?? THEME.axis.gridLineColor;
    this.cfg.leaves.forEach((_, i) => {
      const p = leafCenter(i);
      renderer.create("line", {
        ...(vertical ? { x1: plot.x, y1: p, x2: plot.x + plot.width, y2: p } : { x1: p, y1: plot.y, x2: p, y2: plot.y + plot.height }),
        stroke: color,
        "stroke-width": width,
        class: "facet-gridline",
      }, g);
    });
  }

  // -- Field labels and title -------------------------------------------------

  /** Field names beside their levels, when asked for. */
  private drawFieldLabels(g: SVGGElement): void {
    const opts = this.cfg.vertical ? this.cfg.canvas.fieldLabels?.rows : this.cfg.canvas.fieldLabels?.columns;
    if (!opts?.visible) return;
    const { renderer, plot, fields, vertical, split } = this.cfg;
    const style = { ...FONTS.axisLabel, "font-weight": "600", fill: THEME.axis.labelColor, ...sanitizeStyle(opts.style) };
    const put = (field: string, x: number, y: number, anchor: string) => {
      const el = renderer.text(field, x, y, { ...style, "text-anchor": anchor }, g);
      el.setAttribute("data-fv-kind", "fieldLabel");
      el.setAttribute("data-fv-id", field);
    };
    this.cfg.cells.forEach((level, l) => {
      const rect = level[0]?.rect;
      if (!rect || this.header(l).visible === false) return;
      if (vertical) put(fields[l], rect.x + rect.width / 2, plot.y - 6, "middle");
      else put(fields[l], plot.x - 6, split ? rect.y + rect.height - 4 : rect.y + 12, "end");
    });
    const cat = fields[fields.length - 1];
    if (vertical) {
      const innerW = tierWidths(this.cfg.leaves)[fields.length - 1] ?? 0;
      put(cat, plot.x - LAYOUT.tickLength - this.labelOffset - innerW / 2, plot.y - 6, "middle");
    } else {
      put(cat, plot.x - 6, plot.y + plot.height + LAYOUT.tickLength + this.labelOffset + 12, "end");
    }
  }

  private drawTitle(g: SVGGElement): SVGTextElement | undefined {
    const title = this.cfg.axis.title;
    if (!title?.text || title.enabled === false) return undefined;
    const { plot, vertical, split, leaves } = this.cfg;
    const along = title.align === "start" ? 0 : title.align === "end" ? 1 : 0.5;
    const style = {
      ...FONTS.axisTitle,
      ...sanitizeStyle(title.style),
      "text-anchor": title.align === "start" ? "start" : title.align === "end" ? "end" : "middle",
    };
    if (vertical) {
      const widths = tierWidths(leaves);
      const extent = split ? widths[widths.length - 1] ?? 0 : widths.reduce((a, b) => a + b, 0);
      const x = plot.x - LAYOUT.tickLength - this.labelOffset - extent -
        (title.margin ?? 16 * this.cfg.spacingScale) - (title.offset ?? 0);
      const y = plot.y + plot.height * along;
      return this.cfg.renderer.text(title.text, x, y, { ...style, transform: `rotate(-90 ${x} ${y})` }, g);
    }
    const levels = this.levels;
    const rotExtra = categoryRotationExtent(leaves, this.cfg.axis.labels?.rotation ?? 0);
    const extent = split
      ? Math.max(30 + Math.max(0, levels - 2) * SPLIT_TIER_GAP, 18 + rotExtra)
      : levels * TIER_HEIGHT + rotExtra;
    const margin = title.margin ?? LAYOUT.axisTitleGap * this.cfg.spacingScale;
    const y = plot.y + plot.height + LAYOUT.tickLength + this.labelOffset + extent + margin + (title.offset ?? 0);
    return this.cfg.renderer.text(title.text, plot.x + plot.width * along, y, style, g);
  }
}
