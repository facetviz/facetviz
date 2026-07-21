/**
 * Lollipop series: a thin stem from the zero baseline to each value, topped
 * with a marker — a lighter-weight alternative to a column when the point
 * matters more than the filled area (many categories, or overlapping
 * grouped series that would otherwise read as a cluttered bar forest).
 *
 * Vertical orientation: category on x, value on y (baseline at y=0).
 * Multiple lollipop series are placed side-by-side within each category
 * band, same convention as column/dumbbell.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { CategoryScale } from "../core/scale.js";
import { drawMarker } from "./marker.js";
import { drawDataLabel, labelString, LabelPlacement } from "./data-label.js";
import { alpha } from "../core/colors.js";
import type { Point } from "../core/point.js";

export class LollipopSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    return [0, p.y]; // zero-anchored, like a column
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group(
      { class: `facet-series facet-lollipop ${this.name}` },
      renderer.root,
    );

    const band = catScale.bandwidth ? catScale.bandwidth() : 0;
    const subWidth = band / groupCount;
    const radius = this.options.marker?.radius ?? 5;
    const stemWidth = this.options.lineWidth ?? this.options.size ?? 2;

    for (const p of this.points) {
      if (p.y === undefined) continue;
      const color = p.color ?? this.color;
      const cat =
        catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vBase = valScale.scale(0);
      const vEnd = valScale.scale(p.y);

      const stem = inverted
        ? { x1: vBase, y1: cat, x2: vEnd, y2: cat }
        : { x1: cat, y1: vBase, x2: cat, y2: vEnd };
      renderer.create(
        "line",
        {
          ...stem,
          stroke: alpha(color, 0.55),
          "stroke-width": stemWidth,
          "stroke-linecap": "round",
        },
        g,
      );

      const cx = inverted ? vEnd : cat;
      const cy = inverted ? cat : vEnd;
      const el = drawMarker(renderer, g, cx, cy, {
        symbol: this.options.marker?.symbol ?? "circle",
        radius,
        fill: color,
        stroke: "#fff",
        strokeWidth: 1.5,
      });
      ctx.registerHover(el, p);
      el.addEventListener("click", (e: Event) =>
        ctx.onPointEvent("click", p, e),
      );
      el.addEventListener("mouseover", (e: Event) =>
        ctx.onPointEvent("mouseOver", p, e),
      );
      el.addEventListener("mouseout", (e: Event) =>
        ctx.onPointEvent("mouseOut", p, e),
      );

      this.drawLabel(ctx, p, cx, cy, radius, inverted);
    }
  }

  private drawLabel(
    ctx: SeriesRenderContext,
    p: Point,
    cx: number,
    cy: number,
    radius: number,
    inverted: boolean,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color,
    });
    const d = dl.distance ?? 0;
    const gap = radius + 6 + d;
    const negative = (p.y ?? 0) < 0;
    let place: LabelPlacement;
    if (inverted) {
      place = negative
        ? { x: cx - gap, y: cy + 4, anchor: "end" }
        : { x: cx + gap, y: cy + 4, anchor: "start" };
    } else {
      place = negative
        ? { x: cx, y: cy + gap + 8, anchor: "middle" }
        : { x: cx, y: cy - gap, anchor: "middle" };
    }
    drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
}
