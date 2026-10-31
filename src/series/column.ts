/**
 * Bar-family series: column (vertical) and bar (horizontal). One class handles
 * both because the only difference is which axis is categorical. Range charts
 * live in their own module (`range.ts`).
 */

import { BaseSeries, CanvasHit, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { CategoryScale, Scale } from "../core/scale.js";
import type { Point } from "../core/point.js";
import type { LabelContext } from "../core/options.js";
import {
  dataLabelFontSize,
  dataLabelTextAttrs,
  drawDataLabel,
  labelEnds,
  LabelEnds,
  labelEvery,
  labelsWanted,
  labelString,
  LabelPlacement,
  pointLabelOptions,
} from "./data-label.js";
import { FONTS } from "../core/defaults.js";
import { annularSectorPath, polarCenter, projectPolar } from "./polar.js";
import { FONT_SCALE_STATE } from "../core/theme.js";

export interface ColumnOptions {
  columnWidth?: number;
  /**
   * Set to `false` to pull this series out of the side-by-side grouped
   * layout — it renders across the full category band instead of its own
   * slot, so it overlaps other `grouping: false` series in the same
   * category rather than sitting next to them. Combine with `columnWidth`
   * (or `size`) on each series so narrower bars stay visible in front of
   * wider ones; later series in `chart.series` paint on top.
   */
  grouping?: boolean;
  /**
   * Corner radius (px) for the bar's outer end — the two corners away from
   * the zero baseline (the top for an upward column, the bottom for a
   * downward one; the far end for a `bar`). The near end stays square and
   * flush against the baseline/axis. Radius is clamped to at most half the
   * bar's shorter side. `0`/unset keeps the plain rectangular bar.
   */
  borderRadius?: number;
  /**
   * Which corners `borderRadius` rounds: `'end'` (default) the two at the
   * bar's outer end, `'both'` all four, so both ends are rounded (a pill
   * once the radius reaches half the bar's width).
   */
  borderRadiusEnds?: "end" | "both";
  /**
   * Fraction (0..0.95) of each category's width left empty between
   * neighbouring categories (default 0.2). Cartesian columns and bars only.
   */
  /** On a continuous axis (a timeline): each column fills the step to its
   * nearest neighbour, less `groupPadding` (default 0.1), not 4–24px. */
  fillGap?: boolean;
  groupPadding?: number;
  /**
   * Fraction (0..0.95) of each bar's slot within its category left empty,
   * i.e. the gap between bars of the same category (default 0.1). Ignored
   * when an explicit `columnWidth` is set. Cartesian columns and bars only.
   */
  pointPadding?: number;
  /**
   * The widest (px) a bar sized by its slot grows, so a chart with one or
   * two categories doesn't draw a block filling the plot; the group stays
   * centred on its category. Unset is no limit. Ignored with an explicit
   * `columnWidth`. Cartesian columns and bars only.
   */
  maxColumnWidth?: number;
}

const clampPadding = (v: number | undefined, fallback: number) =>
  v == null || !Number.isFinite(v) ? fallback : Math.min(0.95, Math.max(0, v));

/** A bar's shape drawn inside its rectangle by half its outline's width, so
 *  the outline (centred on the edge) ends on the bar's value and the zero
 *  line instead of spilling past them. `by` is how far it moved in. */
function insetForBorder(
  rect: { x: number; y: number; width: number; height: number },
  strokeWidth: number | undefined,
): { inner: { x: number; y: number; width: number; height: number }; by: number } {
  const by = Math.max(0, Math.min((strokeWidth ?? 0) / 2, rect.width / 2, rect.height / 2));
  if (!by) return { inner: rect, by: 0 };
  return {
    inner: { x: rect.x + by, y: rect.y + by, width: rect.width - 2 * by, height: rect.height - 2 * by },
    by,
  };
}

/** Rect path with only the two corners on `side` rounded; the opposite pair
 *  stays square. `side` names the edge whose corners get rounded, or `all`. */
function roundedBarPath(
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
  side: "top" | "bottom" | "left" | "right" | "all",
): string {
  const { x, y, width, height } = rect;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  switch (side) {
    case "all":
      return (
        `M${x + r},${y} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} ` +
        `V${y + height - r} A${r},${r} 0 0 1 ${x + width - r},${y + height} ` +
        `H${x + r} A${r},${r} 0 0 1 ${x},${y + height - r} V${y + r} ` +
        `A${r},${r} 0 0 1 ${x + r},${y} Z`
      );
    case "top":
      return (
        `M${x},${y + height} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} ` +
        `H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} V${y + height} Z`
      );
    case "bottom":
      return (
        `M${x},${y} H${x + width} V${y + height - r} ` +
        `A${r},${r} 0 0 1 ${x + width - r},${y + height} H${x + r} ` +
        `A${r},${r} 0 0 1 ${x},${y + height - r} V${y} Z`
      );
    case "right":
      return (
        `M${x},${y} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} ` +
        `V${y + height - r} A${r},${r} 0 0 1 ${x + width - r},${y + height} H${x} Z`
      );
    case "left":
      return (
        `M${x + width},${y} V${y + height} H${x + r} ` +
        `A${r},${r} 0 0 1 ${x},${y + height - r} V${y + r} ` +
        `A${r},${r} 0 0 1 ${x + r},${y} H${x + width} Z`
      );
  }
}

/** One bar as drawn: its point, rectangle, fill and rounded corners. */
interface Bar {
  p: Point;
  rect: { x: number; y: number; width: number; height: number };
  fill: string;
  borderRadius: number;
  side: "all" | "top" | "bottom" | "left" | "right";
}

export class ColumnSeries extends BaseSeries {
  /** The series' total for data labels' percentage, worked out once a render. */
  private labelTotal: number | undefined;
  /** And its first and last points with a value. */
  private labelEnds: LabelEnds | undefined;

  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: true };
  }

  /** Stacked segments with labels inside them (the default `center`, or
   *  `inside`/`base`) drop each label that doesn't fit the segment. */
  override fitsLabelsPerSegment(): boolean {
    return (
      !!this.options.stacking &&
      (this.options.dataLabels?.position ?? "center") !== "outside"
    );
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    if (p.stackHigh !== undefined) return [p.stackLow, p.stackHigh];
    return [0, p.y]; // include baseline so columns anchor at zero
  }

  /** Tops of the columns (and stack segment bottoms off the baseline), no zero. */
  override dataExtent(): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const p of this.points) {
      const vals = p.stackHigh !== undefined ? [p.stackHigh, p.stackLow === 0 ? undefined : p.stackLow] : [p.y];
      for (const v of vals) {
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return min === Infinity ? [0, 1] : [min, max];
  }

  override render(ctx: SeriesRenderContext): void {
    if (ctx.polar) {
      this.renderPolar(ctx);
      return;
    }
    const g = ctx.renderer.group({
      class: `facet-series facet-column ${this.name}`,
    });
    this.labelTotal = undefined;
    this.labelEnds = undefined;
    for (const { p, rect, fill, borderRadius, side } of this.bars(ctx)) {
      let el: SVGElement;
      const border = this.borderAttr(fill);
      const { inner, by } = insetForBorder(rect, border["stroke-width"]);
      if (borderRadius > 0) {
        el = ctx.renderer.create(
          "path",
          {
            d: roundedBarPath(inner, borderRadius - by, side),
            fill,
            ...this.fillOpacityAttr(),
            ...border,
            class: "facet-point",
          },
          g,
        );
      } else {
        el = ctx.renderer.create(
          "rect",
          { ...inner, rx: by ? 0 : 1, fill, ...this.fillOpacityAttr(), ...border, class: "facet-point" },
          g,
        );
      }
      ctx.registerHover(el, p);
      this.wireEvents(el, p, ctx);

      this.drawDataLabel(ctx, p, rect, g);
    }
  }

  /**
   * The bars painted on a canvas instead of one SVG element each, for
   * thousands of them: the same rectangles, fills, opacity, outlines and
   * rounded ends as {@link render}, data labels still in SVG. Null when a
   * fill is a gradient or pattern (`url(…)`), which a canvas can't take.
   */
  override renderCanvas(ctx: SeriesRenderContext, c: CanvasRenderingContext2D): CanvasHit[] | null {
    if (ctx.polar) return null;
    const bars = this.bars(ctx);
    if (bars.some((b) => b.fill.startsWith("url("))) return null;
    const g = labelsWanted(this.options.dataLabels)
      ? ctx.renderer.group({ class: `facet-series facet-column ${this.name}` })
      : null;
    const opacity = this.fillOpacityAttr()["fill-opacity"] ?? 1;
    const hits: CanvasHit[] = [];
    this.labelTotal = undefined;
    this.labelEnds = undefined;
    const horizontal = this.type === "bar" || ctx.inverted;
    const catScale = (horizontal ? ctx.yScale : ctx.xScale) as CategoryScale;
    if (typeof catScale.fullStep === "function" && Math.abs(catScale.fullStep()) < 1) {
      this.paintMerged(c, bars, horizontal, opacity, hits);
      if (g) for (const { p, rect } of bars) this.drawDataLabel(ctx, p, rect, g);
      return hits;
    }
    for (const { p, rect, fill, borderRadius, side } of bars) {
      const border = this.borderAttr(fill);
      const { inner, by } = insetForBorder(rect, border["stroke-width"]);
      // As the SVG rect's `rx: 1`, where a bar is wide and tall enough
      // and has no outline (one would round it past the zero line).
      let shape: Path2D | null = null;
      if (borderRadius > 0) shape = new Path2D(roundedBarPath(inner, borderRadius - by, side));
      else if (!by && inner.width >= 2 && inner.height >= 2 && typeof Path2D.prototype.roundRect === "function") {
        shape = new Path2D();
        shape.roundRect(inner.x, inner.y, inner.width, inner.height, 1);
      }
      c.globalAlpha = opacity;
      c.fillStyle = fill;
      if (shape) c.fill(shape);
      else c.fillRect(inner.x, inner.y, inner.width, inner.height);
      c.globalAlpha = 1;
      if (border.stroke) {
        c.strokeStyle = border.stroke;
        c.lineWidth = border["stroke-width"] ?? 1;
        if (shape) c.stroke(shape);
        else c.strokeRect(inner.x, inner.y, inner.width, inner.height);
      }
      hits.push({ point: p, x: rect.x + rect.width / 2, y: rect.y, rect });
      if (g) this.drawDataLabel(ctx, p, rect, g);
    }
    return hits;
  }

  /**
   * Bars closer than a pixel apart: one bar per device pixel (and fill),
   * from the lowest to the highest edge of the bars starting in it, so
   * peaks and dips all show while thousands of overlapping bars become a
   * few hundred. Bucketed and drawn in the canvas's own pixels (from its
   * transform), so neighbours meet without half-covered, lighter edges.
   * Hover answers with the pixel's tallest bar. Borders and rounded ends
   * don't show at that size and are left out.
   */
  private paintMerged(
    c: CanvasRenderingContext2D,
    bars: Bar[],
    horizontal: boolean,
    opacity: number,
    hits: CanvasHit[],
  ): void {
    // Chart units to device pixels: a scale and a shift on each axis.
    const m = c.getTransform();
    const [scale, shift, vScale, vShift] = horizontal ? [m.d, m.f, m.a, m.e] : [m.a, m.e, m.d, m.f];
    const cells = new Map<string, { at: number; lo: number; hi: number; fill: string; tallest: Bar; size: number }>();
    for (const bar of bars) {
      const { rect, fill } = bar;
      const start = horizontal ? rect.x : rect.y;
      const size = horizontal ? rect.width : rect.height;
      const lo = start * vScale + vShift;
      const hi = (start + size) * vScale + vShift;
      // Every device pixel the bar's thickness touches, as a separate bar
      // at a fractional position would color.
      const from = (horizontal ? rect.y : rect.x) * scale + shift;
      const to = from + (horizontal ? rect.height : rect.width) * scale;
      for (let at = Math.floor(from); at < Math.max(Math.ceil(to), Math.floor(from) + 1); at++) {
        const key = `${at}\u0000${fill}`;
        const cell = cells.get(key);
        if (!cell) cells.set(key, { at, lo, hi, fill, tallest: bar, size });
        else {
          cell.lo = Math.min(cell.lo, lo);
          cell.hi = Math.max(cell.hi, hi);
          if (size > cell.size) (cell.tallest = bar), (cell.size = size);
          // Painted in the order fills last appear, as separate bars would
          // leave the last one on top.
          cells.delete(key);
          cells.set(key, cell);
        }
      }
    }
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = opacity;
    for (const { at, lo, hi, fill, tallest } of cells.values()) {
      c.fillStyle = fill;
      if (horizontal) c.fillRect(lo, at, hi - lo, 1);
      else c.fillRect(at, lo, 1, hi - lo);
      // Back in chart units for hover.
      const across = { start: (at - shift) / scale, size: 1 / scale };
      const along = { start: (lo - vShift) / vScale, size: (hi - lo) / vScale };
      const rect = horizontal
        ? { x: along.start, y: across.start, width: along.size, height: across.size }
        : { x: across.start, y: along.start, width: across.size, height: along.size };
      hits.push({ point: tallest.p, x: rect.x + rect.width / 2, y: rect.y, rect });
    }
    c.restore();
  }

  /** The smallest px step between neighbouring x values of the points. */
  private minGapPx(scale: Scale): number {
    const xs = [...new Set(this.points.map((p) => p.x).filter((x): x is number => typeof x === "number"))].sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = Math.abs(scale.scale(xs[i]) - scale.scale(xs[i - 1]));
      if (d > 0 && (!gap || d < gap)) gap = d;
    }
    return gap;
  }

  /** Each bar's rectangle, fill and rounded corners, in drawing order. */
  private bars(ctx: SeriesRenderContext): Bar[] {
    const { groupCount, groupIndex } = ctx;
    // `type: 'bar'` always means horizontal; `chart.inverted: true` swaps a
    // 'column' the same way (the caller already pre-swapped ctx.xScale/
    // ctx.yScale to match, same convention `ctx.inverted` uses elsewhere).
    const horizontal = this.type === "bar" || ctx.inverted;
    const catScale = (horizontal ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale: Scale = horizontal ? ctx.xScale : ctx.yScale;

    // On a continuous axis (columns placed at numbers) there are no bands:
    // each column is a share of the plot's width, 4 to 24px.
    const continuous = catScale.bandwidth() === 0 && typeof catScale.fullStep !== "function";
    const span = Math.abs(catScale.range()[1] - catScale.range()[0]);
    // With `fillGap` (a timeline), a column fills most of the step to its
    // nearest neighbour, as bars along time touch; else 4 to 24px.
    const gapPx = continuous && this.options.fillGap ? this.minGapPx(catScale) : 0;
    const band = continuous
      ? gapPx > 0
        ? gapPx * (1 - clampPadding(this.options.groupPadding, 0.1))
        : Math.max(4, Math.min(24, span * 0.08)) * groupCount
      : this.options.groupPadding != null && typeof catScale.fullStep === "function"
        ? Math.abs(catScale.fullStep()) * (1 - clampPadding(this.options.groupPadding, 0.2))
        : catScale.bandwidth();
    const subWidth = band / groupCount;
    const pointPadding = clampPadding(this.options.pointPadding, 0.1);
    const bars: Bar[] = [];

    for (const p of this.points) {
      const [loVal, hiVal] = this.valuePair(p);
      if (loVal === undefined || hiVal === undefined) continue;
      // A zero segment in a stack has no height: drawn at the 1 px minimum
      // it would show as a sliver of its colour across the stack.
      if (p.stackHigh !== undefined && hiVal === loVal) continue;

      const vLo = valScale.scale(loVal);
      const vHi = valScale.scale(hiVal);
      const cap = this.options.maxColumnWidth;
      const natural = Math.max(1, subWidth * (1 - pointPadding));
      const max_colWidth = cap != null && cap > 0 ? Math.min(natural, cap * FONT_SCALE_STATE.scale) : natural;
      // Falling back to max_colWidth already scales with chart size for
      // free (it's a share of bandwidth(), itself proportional to the
      // plot's live pixel size) -- an author's own explicit columnWidth/
      // size needs the same FONT_SCALE_STATE multiplier applied by hand, or
      // it would stay pinned at its author-time px value while every other
      // unset bar on the same chart grows/shrinks with it. Same
      // responsive:false / reference-size-render opt-out as fonts, since
      // FONT_SCALE_STATE.scale is 1 then too.
      const explicitColWidth =
        p.options.columnWidth ?? this.options.columnWidth ?? this.options.size;
      // An explicit width never outgrows the bar's slot, so wide bars on a
      // small chart don't spill over the next category.
      let colWidth =
        explicitColWidth != null
          ? Math.min(explicitColWidth * FONT_SCALE_STATE.scale, Math.max(1, subWidth))
          : max_colWidth; // leave a little gap between bars

      const center = catScale.scale(p.x);
      // Keep a narrowed group packed around the category centre. Centering
      // every column in its original fixed-width slot would turn the unused
      // width into extra space between neighbouring columns whenever an
      // explicit columnWidth is smaller than the default.
      // A capped bar keeps the gap its padding gives it, not the slot's rest.
      const columnGap = max_colWidth < natural ? (max_colWidth * pointPadding) / (1 - pointPadding) : subWidth - max_colWidth;
      const groupWidth = groupCount * colWidth + (groupCount - 1) * columnGap;
      const catStart =
        center - groupWidth / 2 + groupIndex * (colWidth + columnGap);

      let rect: { x: number; y: number; width: number; height: number };
      if (horizontal) {
        rect = {
          x: Math.min(vLo, vHi),
          y: catStart,
          width: Math.max(1, Math.abs(vHi - vLo)),
          height: colWidth,
        };
      } else {
        rect = {
          x: catStart,
          y: Math.min(vLo, vHi),
          width: colWidth,
          height: Math.max(1, Math.abs(vHi - vLo)),
        };
      }

      const borderRadius =
        p.options.borderRadius ?? this.options.borderRadius ?? 0;
      // Round only the corners at the far/value end -- the near end stays
      // flush against the baseline/axis, whichever pixel side that is --
      // unless the series rounds both ends.
      const ends = p.options.borderRadiusEnds ?? this.options.borderRadiusEnds;
      const far: Bar["side"] = horizontal ? (vHi >= vLo ? "right" : "left") : vHi <= vLo ? "top" : "bottom";
      const near: Bar["side"] = ({ right: "left", left: "right", top: "bottom", bottom: "top" } as const)[far as "right" | "left" | "top" | "bottom"];
      // Stacked, only the stack's outer ends round: its far end on the last
      // segment, and with both ends its base on the first.
      const stacked = p.stackHigh !== undefined;
      const atFar = !stacked || !!p.stackEnd;
      const atNear = ends === "both" && (!stacked || !!p.stackStart);
      const side: Bar["side"] | null = atFar && atNear ? "all" : atFar ? far : atNear ? near : null;
      bars.push({ p, rect, fill: p.color ?? this.color, borderRadius: side ? borderRadius : 0, side: side ?? far });
    }
    return bars;
  }

  /** Each bar's outline, when the series sets `borderColor` or
   *  `borderWidth`: in the bar's own colour, or 1px, for the one unset. */
  private borderAttr(fill: string | undefined): { stroke?: string; "stroke-width"?: number } {
    const { borderColor, borderWidth } = this.options;
    if (borderColor == null && borderWidth == null) return {};
    const width = borderWidth ?? 1;
    return width > 0 ? { stroke: borderColor ?? fill, "stroke-width": width } : {};
  }

  /** The series' `opacity`, clamped to 0..1, for each bar's fill only,
   *  so data labels stay fully opaque. */
  private fillOpacityAttr(): { "fill-opacity"?: number } {
    const opacity = this.options.opacity;
    return typeof opacity === "number" && Number.isFinite(opacity)
      ? { "fill-opacity": Math.min(1, Math.max(0, opacity)) }
      : {};
  }

  private renderPolar(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex } = ctx;
    const group = renderer.group({
      class: `facet-series facet-column facet-polar-column ${this.name}`,
    });
    const center = polarCenter(ctx);
    if (ctx.inverted) {
      const band =
        ctx.xScale.bandwidth() ||
        Math.max(1, ctx.plot.width / 2 / Math.max(1, this.points.length));
      const slot = band / groupCount;
      for (const p of this.points) {
        const [loValue, hiValue] = this.valuePair(p);
        if (loValue === undefined || hiValue === undefined) continue;
        const radial = ctx.xScale.scale(p.x);
        const inner =
          radial - band / 2 + groupIndex * slot + slot * 0.05;
        const outer = inner + slot * 0.9;
        const lo = ctx.yScale.scale(loValue);
        const hi = ctx.yScale.scale(hiValue);
        const start = Math.min(lo, hi);
        const end = Math.max(lo, hi);
        const el = renderer.create(
          "path",
          {
            d: annularSectorPath(
              center.x,
              center.y,
              Math.max(0, inner),
              Math.max(1, outer),
              start,
              end,
              p.options.borderRadius ?? this.options.borderRadius ?? 0,
            ),
            fill: p.color ?? this.color,
            ...this.fillOpacityAttr(),
            class:
              "facet-point facet-polar-sector facet-polar-inverted-sector",
          },
          group,
        );
        ctx.registerHover(el, p);
        this.wireEvents(el, p, ctx);

        if (this.options.dataLabels?.enabled && labelEvery(this.options.dataLabels, p.index)) {
          const point = projectPolar(ctx.plot, hi, outer + 8);
          const total = this.points.reduce(
            (sum, item) => sum + (item.y ?? 0),
            0,
          );
          drawDataLabel(
            renderer,
            group,
            labelString(this.options.dataLabels, {
              x: p.x,
              y: p.y,
              point: p.options,
              series: this.name,
              name: p.name ?? p.x,
              index: p.index,
              color: p.color ?? this.color,
              total,
              percentage: total
                ? ((p.y ?? 0) / total) * 100
                : undefined,
            }),
            {
              x: point.x,
              y: point.y,
              anchor:
                Math.cos(hi) < -0.15
                  ? "end"
                  : Math.cos(hi) > 0.15
                    ? "start"
                    : "middle",
            },
            this.options.dataLabels,
          );
        }
      }
      return;
    }
    const band = ctx.xScale.bandwidth() || (Math.PI * 2) / Math.max(1, this.points.length);
    const slot = band / groupCount;
    for (const p of this.points) {
      const [loValue, hiValue] = this.valuePair(p);
      if (loValue === undefined || hiValue === undefined) continue;
      const angle = ctx.xScale.scale(p.x);
      const start = angle - band / 2 + groupIndex * slot + slot * 0.05;
      const end = start + slot * 0.9;
      const lo = ctx.yScale.scale(loValue);
      const hi = ctx.yScale.scale(hiValue);
      const inner = Math.min(lo, hi);
      const outer = Math.max(lo, hi);
      const el = renderer.create(
        "path",
        {
          d: annularSectorPath(center.x, center.y, inner, outer, start, end, p.options.borderRadius ?? this.options.borderRadius ?? 0),
          fill: p.color ?? this.color,
          ...this.fillOpacityAttr(),
          class: "facet-point facet-polar-sector",
        },
        group,
      );
      ctx.registerHover(el, p);
      this.wireEvents(el, p, ctx);

      if (this.options.dataLabels?.enabled && labelEvery(this.options.dataLabels, p.index)) {
        const mid = (start + end) / 2;
        const point = projectPolar(ctx.plot, mid, outer + 8);
        const total = this.points.reduce((sum, item) => sum + (item.y ?? 0), 0);
        drawDataLabel(
          renderer,
          group,
          labelString(this.options.dataLabels, {
            x: p.x,
            y: p.y,
            point: p.options,
            series: this.name,
            name: p.name ?? p.x,
            index: p.index,
            color: p.color ?? this.color,
            total,
            percentage: total ? ((p.y ?? 0) / total) * 100 : undefined,
          }),
          {
            x: point.x,
            y: point.y,
            anchor: Math.cos(mid) < -0.15 ? "end" : Math.cos(mid) > 0.15 ? "start" : "middle",
          },
          this.options.dataLabels,
        );
      }
    }
  }

  /** The [low, high] value pair driving the rectangle for this point. */
  private valuePair(p: Point): [number | undefined, number | undefined] {
    if (p.stackHigh !== undefined) return [p.stackLow!, p.stackHigh];
    return [0, p.y];
  }

  private wireEvents(el: SVGElement, p: Point, ctx: SeriesRenderContext): void {
    el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
    el.addEventListener("mouseover", (e) =>
      ctx.onPointEvent("mouseOver", p, e),
    );
    el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
  }

  private drawDataLabel(
    ctx: SeriesRenderContext,
    p: Point,
    rect: { x: number; y: number; width: number; height: number },
    parent: SVGElement,
  ): void {
    if (!labelsWanted(this.options.dataLabels)) return;
    const total = (this.labelTotal ??= this.points.reduce((s, pt) => s + (pt.y ?? 0), 0));
    const labelCtx: LabelContext = {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color,
      total,
      percentage: total ? ((p.y ?? 0) / total) * 100 : undefined,
    };
    // The bar's own settings, over the series'.
    const dl = pointLabelOptions(this.options.dataLabels, labelCtx, (this.labelEnds ??= labelEnds(this.points)));
    if (!dl) return;
    const text = labelString(dl, labelCtx);
    const d = dl.distance ?? 0;
    // 'outside' only makes sense for a lone bar or the topmost stacked
    // segment — for any earlier segment it sits inside the segment stacked
    // above it. Default a stacked point to 'center' instead, unless the
    // caller picked a position explicitly.
    const pos =
      dl.position ?? (p.stackHigh !== undefined ? "center" : "outside");
    let place: LabelPlacement;

    // A bar whose value runs the other way (a negative one, or any on a
    // reversed axis) ends at its other edge: its labels mirror.
    const [lo, hi] = this.valuePair(p);
    const sLo = ctx.yScale.scale(lo ?? 0), sHi = ctx.yScale.scale(hi ?? 0);
    if (this.type === "bar" || ctx.inverted) {
      const cy = rect.y + rect.height / 2;
      const flip = sHi < sLo;
      const end = flip ? rect.x : rect.x + rect.width;
      const start = flip ? rect.x + rect.width : rect.x;
      const out = flip ? -1 : 1;
      const toward = (k: 1 | -1) => (k === 1 ? "start" : "end") as "start" | "end";
      if (pos === "inside")
        place = { x: end - out * (4 + d), y: cy, anchor: toward(-out as 1 | -1), verticalAlign: "middle" };
      else if (pos === "center")
        place = {
          x: rect.x + rect.width / 2,
          y: cy,
          anchor: "middle",
          verticalAlign: "middle",
        };
      else if (pos === "base")
        place = { x: start + out * (4 + d), y: cy, anchor: toward(out as 1 | -1), verticalAlign: "middle" };
      else
        place = { x: end + out * (4 + d), y: cy, anchor: toward(out as 1 | -1), verticalAlign: "middle" }; // outside
      // Across the bar: hang from its top edge or sit on its bottom edge.
      if (dl.crossAlign === "start")
        place = { ...place, y: rect.y + 1, verticalAlign: "hanging" };
      else if (dl.crossAlign === "end")
        place = { ...place, y: rect.y + rect.height - 2, verticalAlign: undefined };
    } else {
      const cx = rect.x + rect.width / 2;
      const flip = sHi > sLo;
      const top = rect.y, bottom = rect.y + rect.height;
      // Rotated, an inside label hangs from just below the column's end.
      if (pos === "inside")
        place = flip
          ? dl.rotation
            ? { x: cx, y: bottom - 4 - d, anchor: "middle", side: "up" }
            : { x: cx, y: bottom - 4 - d, anchor: "middle" }
          : dl.rotation
            ? { x: cx, y: top + 4 + d, anchor: "middle", side: "down" }
            : { x: cx, y: top + 12 + d, anchor: "middle" };
      else if (pos === "center")
        place = {
          x: cx,
          y: rect.y + rect.height / 2,
          anchor: "middle",
          verticalAlign: "middle",
        };
      else if (pos === "base")
        place = flip ? { x: cx, y: top + 12 + d, anchor: "middle" } : { x: cx, y: bottom - 5 - d, anchor: "middle" };
      // Outside: past the end, under a column that runs down.
      else place = flip
        ? { x: cx, y: bottom + 4 + d, anchor: "middle", verticalAlign: "hanging", side: "down" }
        : { x: cx, y: top - 4 - d, anchor: "middle" };
      // Across the column: line up with its left or right edge, still
      // above or below the coordinate when rotated.
      const side = place.side ?? (place.verticalAlign === "middle" ? undefined : "up");
      if (dl.crossAlign === "start")
        place = { ...place, x: rect.x + 2, anchor: "start", side };
      else if (dl.crossAlign === "end")
        place = { ...place, x: rect.x + rect.width - 2, anchor: "end", side };
    }
    // A stacked segment's label sits inside the segment: drop it when it
    // would spill over the segment's edges onto its neighbours.
    if (p.stackHigh !== undefined && pos !== "outside" && !labelFits(ctx, text, dl, rect))
      return;
    drawDataLabel(ctx.renderer, parent, text, place, dl, labelCtx);
  }
}

/** Whether `text`, rotated as `dl` asks, fits inside `rect` with a little
 *  breathing room on each side. */
function labelFits(
  ctx: SeriesRenderContext,
  text: string,
  dl: NonNullable<ColumnSeries["options"]["dataLabels"]>,
  rect: { width: number; height: number },
): boolean {
  if (!text) return true;
  const size = ctx.renderer.measureText(text, {
    ...FONTS.dataLabel,
    "font-size": dataLabelFontSize(dl),
    ...dataLabelTextAttrs(dl),
  });
  const w = Math.max(size.width, dl.backgroundColor ? text.length * 6.5 + 8 : 0);
  const h = Math.max(size.height, dl.backgroundColor ? 15 : 0);
  const turn = ((dl.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(turn));
  const sin = Math.abs(Math.sin(turn));
  return (
    w * cos + h * sin + 4 <= rect.width && w * sin + h * cos + 2 <= rect.height
  );
}
