/**
 * Multi-tier ("nested") category x-axis — the hierarchical axis drawn
 * when two or more dimensions are placed on one axis.
 *
 * Given the ordered leaf combinations (each an array of dimension values) and a
 * {@link CategoryScale} placing those leaves, this renders one label row per
 * dimension level with divider lines separating every nested group, through
 * the plot and the label tiers (`groupLines: 'all'` divides every leaf too):
 *
 *      Tech   Furniture  │  Tech   Furniture     ← inner dimension (row 0)
 *   ────────────────────────────────────────
 *          East          │        West           ← outer dimension (row 1)
 */

import type { Renderer, Attrs } from "./renderer.js";
import type { CategoryScale } from "./scale.js";
import type { Rect } from "./axis.js";
import type { AxisOptions } from "./options.js";
import { FONTS, LAYOUT } from "./defaults.js";
import { THEME } from "./theme.js";
import { formatString, sanitizeStyle } from "./utils.js";

/** Extra separation between successive grouping tiers on a split nested axis. */
export const NESTED_SPLIT_TIER_GAP = 6;
/** Baseline-to-baseline spacing for grouping tiers above a split nested axis. */
export const NESTED_SPLIT_TIER_PITCH = 18 + NESTED_SPLIT_TIER_GAP;

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
   * Rotate the innermost (leaf) tier's labels — same convention as
   * `AxisOptions.labels.rotation`. `enabled: false` (e.g. from the chart's
   * responsive shrink handling) hides every tier's label text; the axis
   * baseline and group dividers still draw unless `lineWidth: 0` too.
   */
  labels?: AxisOptions["labels"];
  title?: AxisOptions["title"];
  /** `0` hides the baseline and group-divider lines (gridlines are separate, see `gridLineWidth`). */
  lineWidth?: number;
  /**
   * Which dividers to draw: where a group changes (`'groups'`, default),
   * between every leaf too (`'all'`), or none (`'none'`).
   */
  groupLines?: "groups" | "all" | "none";
  /**
   * Draw a gridline through the plot at each leaf position — same opt-in
   * convention as the plain axis's category-axis gridlines (off by default;
   * a category scale has no "nice" ticks to derive a default width from).
   */
  gridLineWidth?: number;
  gridLineColor?: string;
  /** Fill every other leaf-category band across the plot area. */
  alternateGridColor?: string;
  /**
   * Tier placement:
   *  - `bottom` (default): all tiers stacked below the plot.
   *  - `top`: all tiers stacked above the plot.
   *  - `split`: innermost dimension labelled at the bottom, outer grouping
   *    dimensions on top, with full-height lines separating the groups.
   */
  position?: "bottom" | "top" | "split";
  /**
   * Category axis runs vertically along the plot's left/right edge instead
   * of horizontally below/above it — used for horizontal bar charts
   * (`chart.type: 'bar'` / `chart.inverted`). `position` keeps the same
   * meaning, transposed: `bottom` → left (default, nearest the plot),
   * `top` → right, `split` → innermost at left, outer tiers at right.
   */
  vertical?: boolean;
  /** Scale applied to default outward chrome gaps on constrained charts. */
  spacingScale?: number;
}

interface Segment {
  label: string;
  startLeaf: number;
  endLeaf: number;
}

/**
 * Estimated px width each dimension level needs for its widest label —
 * used both to lay out the vertical (bar-chart) axis and by the chart to
 * reserve the correct amount of space before the plot rect is known.
 */
export function nestedLevelWidths(leaves: string[][]): number[] {
  const levels = leaves[0]?.length ?? 0;
  const widths: number[] = [];
  for (let level = 0; level < levels; level++) {
    let maxLen = 0;
    for (const leaf of leaves)
      maxLen = Math.max(maxLen, (leaf[level] ?? "").length);
    widths[level] = Math.max(40, maxLen * 6.6 + 12);
  }
  return widths;
}

/**
 * Extra vertical room the innermost (leaf) row needs when its labels are
 * rotated — same idea as the plain axis's rotated-label reserve, sized off
 * the leaf labels specifically since those are what actually rotates.
 */
export function nestedInnerRotationExtent(
  leaves: string[][],
  rotation: number,
): number {
  if (!rotation) return 0;
  const maxLen = leaves.reduce(
    (m, l) => Math.max(m, String(l[l.length - 1] ?? "").length),
    0,
  );
  const labelW = maxLen * 6.2 + 6;
  return Math.abs(Math.sin((rotation * Math.PI) / 180)) * labelW;
}

export class NestedAxis {
  constructor(private cfg: NestedAxisConfig) {}

  private get labelsOn(): boolean {
    return this.cfg.labels?.enabled !== false;
  }

  private get linesOn(): boolean {
    return this.cfg.lineWidth !== 0;
  }

  private get groupLines(): "groups" | "all" | "none" {
    return this.cfg.groupLines ?? "groups";
  }

  /** Whether a boundary changing at `level` gets a divider: a group's
   * always, between leaves of one group only with `'all'`. */
  private divides(level: number, levels: number): boolean {
    return level < levels - 1 || this.groupLines === "all";
  }

  /** A group divider from `a` to `b` along x (vertical) or y; none when empty. */
  private divider(attrs: { x1: number; y1: number; x2: number; y2: number }, color: string, g: SVGGElement): void {
    if (this.groupLines === "none") return;
    if (attrs.x1 === attrs.x2 && attrs.y1 === attrs.y2) return;
    this.line(
      { ...attrs, stroke: color, "stroke-width": 1, class: "facet-nested-group-separator" },
      g,
    );
  }

  /** Positive values move every label tier away from the axis baseline. */
  private get labelOffset(): number {
    if (!this.labelsOn) return 0;
    const value = this.cfg.labels?.offset;
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : 0;
  }

  /** No-ops (and returns undefined) when labels are switched off. */
  private text(
    text: string,
    x: number,
    y: number,
    attrs: Attrs,
    g: SVGGElement,
  ): SVGTextElement | undefined {
    if (!this.labelsOn) return undefined;
    const labels = this.cfg.labels;
    const formatted = labels?.formatter
      ? labels.formatter(text)
      : labels?.format
        ? formatString(labels.format, { value: text })
        : text;
    return this.cfg.renderer.text(String(formatted), x, y, {
      ...attrs,
      ...sanitizeStyle(labels?.style),
    }, g);
  }

  /** No-ops when the axis's own lines (baseline, dividers) are switched off. */
  private line(attrs: Attrs, g: SVGGElement): void {
    if (!this.linesOn) return;
    this.cfg.renderer.create("line", attrs, g);
  }

  render(parent: SVGGElement): void {
    if (typeof this.cfg.alternateGridColor === "string") {
      const bandGroup = this.cfg.renderer.group(
        { class: "facet-alternate-grid-bands" },
        parent,
      );
      parent.insertBefore(bandGroup, parent.firstChild);
      this.drawAlternateCategoryBands(bandGroup);
    }
    const g = this.cfg.renderer.group(
      { class: "facet-axis facet-axis-nested" },
      parent,
    );
    this.drawLeafGridlines(g);
    if (this.cfg.vertical) {
      if (this.cfg.position === "split") this.renderSplitVertical(g);
      else this.renderStackedVertical(g, this.cfg.position === "top");
    } else if (this.cfg.position === "split") {
      this.renderSplit(g);
    } else {
      this.renderStacked(g, this.cfg.position === "top");
    }
    this.drawTitle(g);
  }

  /** Fill every other leaf category behind nested-axis series. */
  private drawAlternateCategoryBands(g: SVGGElement): void {
    const { alternateGridColor, renderer, scale, plot, keys, vertical } =
      this.cfg;
    if (typeof alternateGridColor !== "string") return;
    const halfStep = Math.abs(scale.fullStep()) / 2;
    keys.forEach((key, index) => {
      if (index % 2 === 0) return;
      const centre = scale.scale(key);
      const rect = vertical
        ? {
            x: plot.x,
            y: Math.max(plot.y, centre - halfStep),
            width: plot.width,
            height:
              Math.min(plot.y + plot.height, centre + halfStep) -
              Math.max(plot.y, centre - halfStep),
          }
        : {
            x: Math.max(plot.x, centre - halfStep),
            y: plot.y,
            width:
              Math.min(plot.x + plot.width, centre + halfStep) -
              Math.max(plot.x, centre - halfStep),
            height: plot.height,
          };
      renderer.create(
        "rect",
        {
          ...rect,
          fill: alternateGridColor,
          stroke: "none",
          class: "facet-alternate-grid-band",
        },
        g,
      );
    });
  }

  private drawTitle(g: SVGGElement): void {
    const title = this.cfg.title;
    if (!title?.text || title.enabled === false) return;
    const { plot, leaves, vertical, position } = this.cfg;
    const levels = leaves[0]?.length ?? 0;
    const align = title.align ?? "center";
    const along = align === "start" ? 0 : align === "end" ? 1 : 0.5;
    const style = {
      ...FONTS.axisTitle,
      ...sanitizeStyle(title.style),
      "text-anchor":
        align === "start" ? "start" : align === "end" ? "end" : "middle",
    };
    if (vertical) {
      const widths = nestedLevelWidths(leaves);
      const sideRight = position === "top";
      const extent = position === "split"
        ? widths[widths.length - 1] ?? 0
        : widths.reduce((sum, width) => sum + width, 0);
      const x = sideRight
        ? plot.x +
          plot.width +
          LAYOUT.tickLength +
          this.labelOffset +
          extent +
          (title.margin ?? 16 * (this.cfg.spacingScale ?? 1)) +
          (title.offset ?? 0)
        : plot.x -
          LAYOUT.tickLength -
          this.labelOffset -
          extent -
          (title.margin ?? 16 * (this.cfg.spacingScale ?? 1)) -
          (title.offset ?? 0);
      const y = plot.y + plot.height * along;
      const rotation = sideRight ? 90 : -90;
      this.cfg.renderer.text(title.text, x, y, {
        ...style,
        transform: `rotate(${rotation} ${x} ${y})`,
      }, g);
      return;
    }
    const rotation = this.cfg.labels?.rotation ?? 0;
    const rotExtra = nestedInnerRotationExtent(leaves, rotation);
    const top = position === "top";
    // Split axes keep only the innermost label row below the plot, but their
    // category separators extend beyond the baseline, progressively farther
    // for each outer tier. Keep the existing 10px clearance beyond the longest
    // separator so the title retains its full margin from labels and lines.
    const splitSeparatorExtra =
      Math.max(0, levels - 2) * NESTED_SPLIT_TIER_GAP;
    const labelExtent = position === "split"
      ? Math.max(30 + splitSeparatorExtra, 18 + rotExtra)
      : levels * 18 + rotExtra;
    const x = plot.x + plot.width * along;
    const margin = title.margin ??
      LAYOUT.axisTitleGap * (this.cfg.spacingScale ?? 1);
    const offset = title.offset ?? 0;
    const y = top
      ? plot.y - LAYOUT.tickLength - this.labelOffset - labelExtent - margin - offset
      : plot.y + plot.height + LAYOUT.tickLength + this.labelOffset + labelExtent + margin + offset;
    this.cfg.renderer.text(title.text, x, y, style, g);
  }

  /** A gridline through the plot at each leaf position, opt-in via `gridLineWidth`. */
  private drawLeafGridlines(g: SVGGElement): void {
    const width = this.cfg.gridLineWidth;
    if (!width) return;
    const { renderer, scale, plot, keys } = this.cfg;
    const color = this.cfg.gridLineColor ?? THEME.axis.gridLineColor;
    for (const key of keys) {
      const pos = scale.scale(key);
      const coords = this.cfg.vertical
        ? { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos }
        : { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height };
      renderer.create(
        "line",
        { ...coords, stroke: color, "stroke-width": width },
        g,
      );
    }
  }

  /** All tiers on one side (below or above the plot). */
  private renderStacked(g: SVGGElement, top: boolean): void {
    const { scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? THEME.axis.lineColor;
    const levels = leaves[0]?.length ?? 0;
    const dir = top ? -1 : 1; // +1 grows rows downward, -1 upward
    const baseY = top ? plot.y : plot.y + plot.height;
    const rowH = 18;
    const rotation = this.cfg.labels?.rotation ?? 0;
    const rotExtra = nestedInnerRotationExtent(leaves, rotation);
    // Row 0 (innermost) grows to fit its rotated labels; every row after it
    // shifts down by that same extra amount.
    const rowHeight = (row: number) => (row === 0 ? rowH + rotExtra : rowH);
    const rowOffset = (row: number) => {
      let sum = 0;
      for (let r = 0; r < row; r++) sum += rowHeight(r);
      return sum;
    };
    const leafCenter = (i: number) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;

    this.line(
      { x1: plot.x, y1: baseY, x2: plot.x + plot.width, y2: baseY, stroke: color },
      g,
    );

    for (let level = levels - 1; level >= 0; level--) {
      const row = levels - 1 - level; // 0 = innermost
      const rotated = row === 0 && rotation;
      const rowStart =
        baseY +
        dir * (LAYOUT.tickLength + this.labelOffset + rowOffset(row));
      const segments = this.segmentsForLevel(leaves, level);
      const labelY = rowStart + dir * (rotated ? 8 : 12);
      // Only the innermost, unrotated row can overlap from sheer leaf count
      // as the chart narrows — rotated labels already dodge that, and outer
      // tiers have far fewer, wider segments. Only the label text thins out;
      // separator calculation below still uses every leaf boundary.
      const labelSegs =
        row === 0 && !rotated
          ? this.thinnedInnerSegments(scale.bandwidth())
          : segments;

      for (const seg of labelSegs) {
        const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        const el = this.text(
          seg.label,
          cx,
          labelY,
          {
            "text-anchor": rotated ? (rotation < 0 ? "end" : "start") : "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400",
          },
          g,
        );
        if (rotated && el) el.setAttribute("transform", `rotate(${rotation} ${cx} ${labelY})`);
      }

    }

    // A group's divider runs through the plot and on into the row of the
    // outermost dimension that changed. Leaves of one group are divided
    // (through the plot only, having no row of their own) with `'all'`.
    const plotExtent = top ? plot.y + plot.height : plot.y;
    for (const boundary of this.categoryBoundaries()) {
      if (!this.divides(boundary.level, levels)) continue;
      const row = levels - 1 - boundary.level;
      const rowStart =
        baseY +
        dir * (LAYOUT.tickLength + this.labelOffset + rowOffset(row));
      const bx = leafCenter(boundary.startLeaf) - bandHalf;
      const axisExtent = boundary.level === levels - 1
        ? baseY
        : rowStart + dir * rowHeight(row);
      this.divider({ x1: bx, y1: plotExtent, x2: bx, y2: axisExtent }, color, g);
    }
  }

  /**
   * Split layout: innermost dimension as normal labels at the bottom, outer
   * grouping dimensions stacked on top, and full-height vertical lines
   * separating the nested groups at every dimension level.
   */
  private renderSplit(g: SVGGElement): void {
    const { scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? THEME.axis.lineColor;
    const levels = leaves[0]?.length ?? 0;
    const rowH = NESTED_SPLIT_TIER_PITCH;
    const leafCenter = (i: number) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;
    const bottomY = plot.y + plot.height;

    // Bottom axis line + innermost dimension labels.
    this.line(
      { x1: plot.x, y1: bottomY, x2: plot.x + plot.width, y2: bottomY, stroke: color },
      g,
    );
    const rotation = this.cfg.labels?.rotation ?? 0;
    const innerLabelY =
      bottomY +
      LAYOUT.tickLength +
      this.labelOffset +
      (rotation ? 8 : 12);
    const innerSegments = rotation
      ? this.segmentsForLevel(leaves, levels - 1)
      : this.thinnedInnerSegments(scale.bandwidth());
    for (const seg of innerSegments) {
      const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
      const el = this.text(
        seg.label,
        cx,
        innerLabelY,
        {
          "text-anchor": rotation ? (rotation < 0 ? "end" : "start") : "middle",
          ...FONTS.axisLabel,
        },
        g,
      );
      if (rotation && el) el.setAttribute("transform", `rotate(${rotation} ${cx} ${innerLabelY})`);
    }

    // Outer grouping dimensions on top (outermost furthest up).
    for (let level = levels - 2; level >= 0; level--) {
      const rowFromTop = levels - 2 - level; // 0 = closest to the plot
      const labelY =
        plot.y -
        LAYOUT.tickLength -
        this.labelOffset -
        rowFromTop * rowH -
        4;
      for (const seg of this.segmentsForLevel(leaves, level)) {
        const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        this.text(
          seg.label,
          cx,
          labelY,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400",
          },
          g,
        );
      }
    }

    // A group's divider runs from its row on top through the plot into the
    // label area below. Leaves of one group are divided (through the plot
    // only) with `'all'`.
    for (const boundary of this.categoryBoundaries()) {
      if (!this.divides(boundary.level, levels)) continue;
      const topExtent = boundary.level === levels - 1
        ? plot.y
        : plot.y -
          LAYOUT.tickLength -
          this.labelOffset -
          (levels - 1 - boundary.level) * rowH;
      const bottomExtent = boundary.level === levels - 1
        ? bottomY
        : bottomY +
          LAYOUT.tickLength +
          this.labelOffset +
          20 +
          (levels - 2 - boundary.level) * NESTED_SPLIT_TIER_GAP;
      const bx = leafCenter(boundary.startLeaf) - bandHalf;
      this.divider({ x1: bx, y1: topExtent, x2: bx, y2: bottomExtent }, color, g);
    }
  }

  /**
   * All tiers on one vertical side (left or right of the plot) — the
   * transposed counterpart of {@link renderStacked}, for horizontal bar
   * charts. Each tier is a column whose width fits its longest label
   * (unlike the horizontal case, where every tier is just one fixed-height
   * row regardless of label length).
   */
  private renderStackedVertical(g: SVGGElement, right: boolean): void {
    const { scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? THEME.axis.lineColor;
    const levels = leaves[0]?.length ?? 0;
    const dir = right ? 1 : -1; // +1 grows rightward, -1 leftward
    const baseX = right ? plot.x + plot.width : plot.x;
    const leafCenter = (i: number) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;

    this.line(
      { x1: baseX, y1: plot.y, x2: baseX, y2: plot.y + plot.height, stroke: color },
      g,
    );

    const colWidths = nestedLevelWidths(leaves);
    let offset = 0;
    for (let level = levels - 1; level >= 0; level--) {
      const w = colWidths[level];
      const colStart =
        baseX + dir * (LAYOUT.tickLength + this.labelOffset + offset);
      const segments = this.segmentsForLevel(leaves, level);
      const labelX = colStart + dir * (w / 2);

      for (const seg of segments) {
        const cy = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2 + 4;
        this.text(
          seg.label,
          labelX,
          cy,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400",
          },
          g,
        );
      }

      if (level < levels - 1) {
        for (let s = 1; s < segments.length; s++) {
          const by = leafCenter(segments[s].startLeaf) - bandHalf;
          this.divider({ x1: baseX, y1: by, x2: colStart + dir * w, y2: by }, color, g);
        }
      }
      offset += w;
    }

    // Separators between the outermost groups, in the label gutter (axis
    // boundary to the far edge of the label columns).
    const farEdge =
      baseX + dir * (LAYOUT.tickLength + this.labelOffset + offset);
    const outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      const by = leafCenter(outer[s].startLeaf) - bandHalf;
      this.divider({ x1: baseX, y1: by, x2: farEdge, y2: by }, color, g);
    }
    // Across the plot too: a group's divider, and with `'all'` every leaf's.
    const plotFar = right ? plot.x : plot.x + plot.width;
    for (const boundary of this.categoryBoundaries()) {
      if (!this.divides(boundary.level, levels)) continue;
      const by = leafCenter(boundary.startLeaf) - bandHalf;
      this.divider({ x1: plotFar, y1: by, x2: baseX, y2: by }, color, g);
    }
  }

  /**
   * Split layout, vertical: innermost dimension as normal labels at the
   * left (nearest the plot), outer grouping dimensions stacked to the
   * right, full-width horizontal lines separating each top-level group.
   */
  private renderSplitVertical(g: SVGGElement): void {
    const { scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? THEME.axis.lineColor;
    const levels = leaves[0]?.length ?? 0;
    const leafCenter = (i: number) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;
    const rightX = plot.x + plot.width;
    const colWidths = nestedLevelWidths(leaves);

    // Left axis line + innermost dimension labels.
    this.line(
      { x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.height, stroke: color },
      g,
    );
    const innerW = colWidths[levels - 1];
    const innerSegments = this.segmentsForLevel(leaves, levels - 1);
    for (const seg of innerSegments) {
      const cy = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2 + 4;
      this.text(
        seg.label,
        plot.x - LAYOUT.tickLength - this.labelOffset - innerW / 2,
        cy,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        g,
      );
    }

    // Outer grouping dimensions to the right of the plot (outermost farthest right).
    let offset = 0;
    for (let level = levels - 2; level >= 0; level--) {
      const w = colWidths[level];
      const labelX =
        rightX + LAYOUT.tickLength + this.labelOffset + offset + w / 2;
      for (const seg of this.segmentsForLevel(leaves, level)) {
        const cy = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2 + 4;
        this.text(
          seg.label,
          labelX,
          cy,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400",
          },
          g,
        );
      }
      offset += w;
    }

    // A group's divider runs across both label gutters and the plot;
    // with `'all'`, leaves of one group are divided across the plot.
    const leftExtent =
      plot.x - LAYOUT.tickLength - this.labelOffset - innerW;
    const rightExtent =
      rightX + LAYOUT.tickLength + this.labelOffset + offset;
    for (const boundary of this.categoryBoundaries()) {
      if (!this.divides(boundary.level, levels)) continue;
      const by = leafCenter(boundary.startLeaf) - bandHalf;
      const leaf = boundary.level === levels - 1;
      this.divider({ x1: leaf ? plot.x : leftExtent, y1: by, x2: leaf ? rightX : rightExtent, y2: by }, color, g);
    }
  }

  /**
   * Which of the innermost tier's segments to actually draw, thinning out
   * ("every Nth") when they'd otherwise overlap — the same idea the plain
   * axis uses for a cramped category axis. With an outer dimension, the
   * "every Nth" counter resets at each outer-group boundary so the kept/
   * skipped pattern reads the same within every group instead of sliding
   * across group lines, which would otherwise make it look like different,
   * arbitrary leaves are missing from each group.
   */
  private thinnedInnerSegments(bandPx: number): Segment[] {
    const { leaves } = this.cfg;
    const levels = leaves[0]?.length ?? 0;
    const inner = this.segmentsForLevel(leaves, levels - 1);
    if (bandPx <= 0 || inner.length < 2) return inner;
    const maxLen = inner.reduce((m, s) => Math.max(m, s.label.length), 0);
    const estW = maxLen * 6.2 + 6;
    const step = estW > bandPx ? Math.ceil(estW / bandPx) : 1;
    if (step <= 1) return inner;
    if (levels <= 1) return inner.filter((_, i) => i % step === 0);
    const outer = this.segmentsForLevel(leaves, 0);
    let outerIdx = 0;
    return inner.filter((seg) => {
      while (outerIdx < outer.length - 1 && seg.startLeaf > outer[outerIdx].endLeaf) {
        outerIdx++;
      }
      return (seg.startLeaf - outer[outerIdx].startLeaf) % step === 0;
    });
  }

  /**
   * Boundaries between adjacent leaves and the outermost dimension that
   * changes at each one. A separator uses that level to decide how far it
   * must extend into the nested label tiers.
   */
  private categoryBoundaries(): Array<{ startLeaf: number; level: number }> {
    const { leaves } = this.cfg;
    const boundaries: Array<{ startLeaf: number; level: number }> = [];
    for (let leaf = 1; leaf < leaves.length; leaf++) {
      const previous = leaves[leaf - 1];
      const current = leaves[leaf];
      const levels = Math.max(previous.length, current.length);
      for (let level = 0; level < levels; level++) {
        if (previous[level] !== current[level]) {
          boundaries.push({ startLeaf: leaf, level });
          break;
        }
      }
    }
    return boundaries;
  }

  /** Contiguous runs of leaves sharing the same prefix up to `level`. */
  private segmentsForLevel(leaves: string[][], level: number): Segment[] {
    const segments: Segment[] = [];
    const prefixKey = (leaf: string[]) =>
      leaf.slice(0, level + 1).join("\u0000");
    let start = 0;
    for (let i = 1; i <= leaves.length; i++) {
      if (
        i === leaves.length ||
        prefixKey(leaves[i]) !== prefixKey(leaves[start])
      ) {
        segments.push({
          label: leaves[start][level],
          startLeaf: start,
          endLeaf: i - 1,
        });
        start = i;
      }
    }
    return segments;
  }
}
