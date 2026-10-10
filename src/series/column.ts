/**
 * Bar-family series: column (vertical) and bar (horizontal). One class handles
 * both because the only difference is which axis is categorical. Range charts
 * live in their own module (`range.ts`).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { CategoryScale, Scale } from "../core/scale.js";
import type { Point } from "../core/point.js";
import { drawDataLabel, labelString, LabelPlacement } from "./data-label.js";
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
   * Fraction (0..0.95) of each category's width left empty between
   * neighbouring categories (default 0.2). Cartesian columns and bars only.
   */
  groupPadding?: number;
  /**
   * Fraction (0..0.95) of each bar's slot within its category left empty,
   * i.e. the gap between bars of the same category (default 0.1). Ignored
   * when an explicit `columnWidth` is set. Cartesian columns and bars only.
   */
  pointPadding?: number;
}

const clampPadding = (v: number | undefined, fallback: number) =>
  v == null || !Number.isFinite(v) ? fallback : Math.min(0.95, Math.max(0, v));

/** Rect path with only the two corners on `side` rounded; the opposite pair
 *  stays square. `side` names the edge whose corners get rounded. */
function roundedBarPath(
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
  side: "top" | "bottom" | "left" | "right",
): string {
  const { x, y, width, height } = rect;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  switch (side) {
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

export class ColumnSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: true };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    if (p.stackHigh !== undefined) return [p.stackLow, p.stackHigh];
    return [0, p.y]; // include baseline so columns anchor at zero
  }

  override render(ctx: SeriesRenderContext): void {
    if (ctx.polar) {
      this.renderPolar(ctx);
      return;
    }
    const { renderer, groupCount, groupIndex } = ctx;
    // `type: 'bar'` always means horizontal; `chart.inverted: true` swaps a
    // 'column' the same way (the caller already pre-swapped ctx.xScale/
    // ctx.yScale to match, same convention `ctx.inverted` uses elsewhere).
    const horizontal = this.type === "bar" || ctx.inverted;
    const catScale = (horizontal ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale: Scale = horizontal ? ctx.xScale : ctx.yScale;
    const g = renderer.group({
      class: `facet-series facet-column ${this.name}`,
    });

    const band =
      this.options.groupPadding != null && typeof catScale.fullStep === "function"
        ? Math.abs(catScale.fullStep()) * (1 - clampPadding(this.options.groupPadding, 0.2))
        : catScale.bandwidth();
    const subWidth = band / groupCount;
    const pointPadding = clampPadding(this.options.pointPadding, 0.1);

    for (const p of this.points) {
      const [loVal, hiVal] = this.valuePair(p);
      if (loVal === undefined || hiVal === undefined) continue;

      const vLo = valScale.scale(loVal);
      const vHi = valScale.scale(hiVal);
      const max_colWidth = Math.max(1, subWidth * (1 - pointPadding));
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
      let colWidth =
        explicitColWidth != null
          ? explicitColWidth * FONT_SCALE_STATE.scale
          : max_colWidth; // leave a little gap between bars

      const center = catScale.scale(p.x);
      // Keep a narrowed group packed around the category centre. Centering
      // every column in its original fixed-width slot would turn the unused
      // width into extra space between neighbouring columns whenever an
      // explicit columnWidth is smaller than the default.
      const columnGap = subWidth - max_colWidth;
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
      const fill = p.color ?? this.color;
      let el: SVGElement;
      if (borderRadius > 0) {
        // Round only the corners at the far/value end -- the near end stays
        // flush against the baseline/axis, whichever pixel side that is.
        const side = horizontal
          ? vHi >= vLo
            ? "right"
            : "left"
          : vHi <= vLo
            ? "top"
            : "bottom";
        el = renderer.create(
          "path",
          {
            d: roundedBarPath(rect, borderRadius, side),
            fill,
            class: "facet-point",
          },
          g,
        );
      } else {
        el = renderer.create(
          "rect",
          { ...rect, rx: 1, fill, class: "facet-point" },
          g,
        );
      }
      ctx.registerHover(el, p);
      this.wireEvents(el, p, ctx);

      this.drawDataLabel(ctx, p, rect, g);
    }
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
            ),
            fill: p.color ?? this.color,
            class:
              "facet-point facet-polar-sector facet-polar-inverted-sector",
          },
          group,
        );
        ctx.registerHover(el, p);
        this.wireEvents(el, p, ctx);

        if (this.options.dataLabels?.enabled) {
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
          d: annularSectorPath(center.x, center.y, inner, outer, start, end),
          fill: p.color ?? this.color,
          class: "facet-point facet-polar-sector",
        },
        group,
      );
      ctx.registerHover(el, p);
      this.wireEvents(el, p, ctx);

      if (this.options.dataLabels?.enabled) {
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
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const total = this.points.reduce((s, pt) => s + (pt.y ?? 0), 0);
    const text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color,
      total,
      percentage: total ? ((p.y ?? 0) / total) * 100 : undefined,
    });
    const d = dl.distance ?? 0;
    // 'outside' only makes sense for a lone bar or the topmost stacked
    // segment — for any earlier segment it sits inside the segment stacked
    // above it. Default a stacked point to 'center' instead, unless the
    // caller picked a position explicitly.
    const pos =
      dl.position ?? (p.stackHigh !== undefined ? "center" : "outside");
    let place: LabelPlacement;

    if (this.type === "bar" || ctx.inverted) {
      const cy = rect.y + rect.height / 2;
      const end = rect.x + rect.width;
      if (pos === "inside")
        place = { x: end - 4 - d, y: cy, anchor: "end", verticalAlign: "middle" };
      else if (pos === "center")
        place = {
          x: rect.x + rect.width / 2,
          y: cy,
          anchor: "middle",
          verticalAlign: "middle",
        };
      else if (pos === "base")
        place = { x: rect.x + 4 + d, y: cy, anchor: "start", verticalAlign: "middle" };
      else
        place = { x: end + 4 + d, y: cy, anchor: "start", verticalAlign: "middle" }; // outside
    } else {
      const cx = rect.x + rect.width / 2;
      if (pos === "inside")
        place = { x: cx, y: rect.y + 12 + d, anchor: "middle" };
      else if (pos === "center")
        place = {
          x: cx,
          y: rect.y + rect.height / 2,
          anchor: "middle",
          verticalAlign: "middle",
        };
      else if (pos === "base")
        place = { x: cx, y: rect.y + rect.height - 5 - d, anchor: "middle" };
      else place = { x: cx, y: rect.y - 4 - d, anchor: "middle" }; // outside
    }
    drawDataLabel(ctx.renderer, parent, text, place, dl);
  }
}
