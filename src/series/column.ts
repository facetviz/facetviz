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

export interface ColumnOptions {
  columnWidth?: number;
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

    const band = catScale.bandwidth();
    const subWidth = band / groupCount;

    for (const p of this.points) {
      const [loVal, hiVal] = this.valuePair(p);
      if (loVal === undefined || hiVal === undefined) continue;

      const center = catScale.scale(p.x);
      // Offset within the category band for grouped (side-by-side) series.
      const catStart = center - band / 2 + groupIndex * subWidth;
      const vLo = valScale.scale(loVal);
      const vHi = valScale.scale(hiVal);
      const max_colWidth = Math.max(1, subWidth * 0.9);
      let colWidth =
        p.options.columnWidth ??
        this.options.columnWidth ??
        this.options.size ??
        max_colWidth; // leave a little gap between bars

      let rect: { x: number; y: number; width: number; height: number };
      if (horizontal) {
        rect = {
          x: Math.min(vLo, vHi),
          y: catStart + (subWidth - colWidth) / 2,
          width: Math.max(1, Math.abs(vHi - vLo)),
          height: colWidth,
        };
      } else {
        rect = {
          x: catStart + (subWidth - colWidth) / 2,
          y: Math.min(vLo, vHi),
          width: colWidth,
          height: Math.max(1, Math.abs(vHi - vLo)),
        };
      }

      const el = renderer.create(
        "rect",
        {
          ...rect,
          rx: 1,
          fill: p.color ?? this.color,
          class: "facet-point",
        },
        g,
      );
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
      const cy = rect.y + rect.height / 2 + 4;
      const end = rect.x + rect.width;
      if (pos === "inside") place = { x: end - 4 - d, y: cy, anchor: "end" };
      else if (pos === "center")
        place = { x: rect.x + rect.width / 2, y: cy, anchor: "middle" };
      else if (pos === "base")
        place = { x: rect.x + 4 + d, y: cy, anchor: "start" };
      else place = { x: end + 4 + d, y: cy, anchor: "start" }; // outside
    } else {
      const cx = rect.x + rect.width / 2;
      if (pos === "inside")
        place = { x: cx, y: rect.y + 12 + d, anchor: "middle" };
      else if (pos === "center")
        place = { x: cx, y: rect.y + rect.height / 2 + 4, anchor: "middle" };
      else if (pos === "base")
        place = { x: cx, y: rect.y + rect.height - 5 - d, anchor: "middle" };
      else place = { x: cx, y: rect.y - 4 - d, anchor: "middle" }; // outside
    }
    drawDataLabel(ctx.renderer, parent, text, place, dl);
  }
}
