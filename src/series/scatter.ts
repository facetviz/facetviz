/**
 * Scatter and jitter series. Both plot individual markers; jitter adds a
 * deterministic horizontal spread so overlapping categorical points separate
 * out (useful for distribution views).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { CategoryScale } from "../core/scale.js";
import { drawMarker } from "./marker.js";
import { seededRandom } from "../core/utils.js";
import { drawPointLabels } from "./data-label.js";
import type { Pt } from "./paths.js";
import type { Point } from "../core/point.js";
import { projectPolar } from "./polar.js";

export interface ScatterPointOptions {
  radius?: number;
}

/** Scatter/jitter's series-level fields. */
export interface ScatterSeriesOptions {
  /** Horizontal spread (in category band widths) for `jitter` charts. */
  jitter?: number;
  radius?: number;
}

export class ScatterSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: true, stackable: false };
  }

  private get isJitter(): boolean {
    return this.type === "jitter";
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer } = ctx;
    const g = renderer.group(
      { class: `facet-series facet-scatter ${this.name}` },
      renderer.root,
    );

    // `chart.inverted` swaps which scale carries the category vs. the
    // value axis (same convention as ColumnSeries.render / LineSeries) --
    // jitter's spread is a category-band offset, so it moves with catScale
    // too instead of always landing on the x pixel.
    const catScale = ctx.inverted ? ctx.yScale : ctx.xScale;
    const valScale = ctx.inverted ? ctx.xScale : ctx.yScale;
    const marker = this.options.marker ?? {};
    const rng = seededRandom(this.index * 7919 + this.points.length + 1);
    const band = catScale instanceof CategoryScale ? catScale.bandwidth() : 0;
    const spread = (this.options.jitter ?? 0.5) * band;
    const labelData: Array<{ pt: Pt; p: Point }> = [];

    for (const p of this.points) {
      if (p.y === undefined) continue;
      let catPx = catScale.scale(p.x);
      if (this.isJitter && band > 0) catPx += (rng() - 0.5) * spread;
      const valPx = valScale.scale(p.y);
      const projected = ctx.polar
        ? projectPolar(ctx.plot, catPx, valPx)
        : undefined;
      const x = projected?.x ?? (ctx.inverted ? valPx : catPx);
      const y = projected?.y ?? (ctx.inverted ? catPx : valPx);
      labelData.push({ pt: { x, y }, p });
      const radius =
        p.options.radius ??
        this.options.radius ??
        this.options.size ??
        marker.radius ??
        5;
      const el =
        marker.enabled === false
          ? renderer.create(
              "circle",
              {
                cx: x,
                cy: y,
                r: Math.max(8, radius),
                fill: "transparent",
                "pointer-events": "all",
                class: "facet-point-hit",
              },
              g,
            )
          : drawMarker(renderer, g, x, y, {
              symbol: marker.symbol ?? "circle",
              radius,
              fill: p.color ?? marker.fillColor ?? this.color,
              stroke: marker.lineColor ?? "#ffffff",
              strokeWidth: marker.lineWidth ?? 1,
              width: marker.width,
              height: marker.height,
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
    }
    drawPointLabels(
      renderer,
      g,
      this.options.dataLabels,
      this.name,
      labelData,
      this.color,
    );
  }
}
