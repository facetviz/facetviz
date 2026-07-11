/**
 * Bar-family series: column (vertical) and bar (horizontal). One class handles
 * both because the only difference is which axis is categorical. Range charts
 * live in their own module (`range.ts`).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { CategoryScale, Scale } from "../core/scale.js";
import type { Point } from "../core/point.js";
import { drawDataLabel, labelString, LabelPlacement } from "./data-label.js";

export class ColumnSeries extends BaseSeries {
  private get horizontal(): boolean {
    return this.type === "bar";
  }

  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: true };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    if (p.stackHigh !== undefined) return [p.stackLow, p.stackHigh];
    return [0, p.y]; // include baseline so columns anchor at zero
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex } = ctx;
    const catScale = (
      this.horizontal ? ctx.yScale : ctx.xScale
    ) as CategoryScale;
    const valScale: Scale = this.horizontal ? ctx.xScale : ctx.yScale;
    const g = renderer.group({
      class: `jchart-series jchart-column ${this.name}`,
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

      let rect: { x: number; y: number; width: number; height: number };
      if (this.horizontal) {
        rect = {
          x: Math.min(vLo, vHi),
          y: catStart,
          width: Math.max(1, Math.abs(vHi - vLo)),
          height: Math.max(1, subWidth * 0.9),
        };
      } else {
        rect = {
          x: catStart,
          y: Math.min(vLo, vHi),
          width: Math.max(1, subWidth * 0.9),
          height: Math.max(1, Math.abs(vHi - vLo)),
        };
      }

      const el = renderer.create(
        "rect",
        {
          ...rect,
          rx: 0,
          fill: p.color ?? this.color,
          class: "jchart-point",
        },
        g,
      );
      ctx.registerHover(el, p);
      this.wireEvents(el, p, ctx);

      this.drawDataLabel(ctx, p, rect);
    }

    renderer.root.appendChild(g);
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
    const pos = dl.position ?? "outside";
    let place: LabelPlacement;

    if (this.horizontal) {
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
    drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
}
