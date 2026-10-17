/**
 * Dumbbell series. For each category a connector line joins a `low` and a
 * `high` value, with a coloured marker at each end — ideal for showing the
 * change or gap between two measures (before/after, min/max, etc.).
 *
 * Vertical orientation: category on x, value on y. Multiple dumbbell series are
 * placed side-by-side within each category band (grouped).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { CategoryScale, Scale } from "../core/scale.js";
import { drawMarker } from "./marker.js";
import { drawDataLabel, labelString, LabelPlacement } from "./data-label.js";
import { THEME } from "../core/theme.js";
import type { Point } from "../core/point.js";
import { circularArcPath, polarCenter, projectPolar } from "./polar.js";

/**
 * Dumbbell's series-level fields. Its `low`/`high` point shape isn't listed
 * separately here because it's shared verbatim with the other range-band
 * types (arearange, areasplinerange, columnrange, errorbar) — see
 * `PointOptions` in core/options.ts.
 *
 * Resolution order for any given point's colour/width is: point option →
 * series option → `plotOptions.dumbbell`/`plotOptions.series` → built-in
 * default — the last three are already folded into `this.options` by the
 * time a series renders (see `resolveChartOptions`), so render() only has to
 * choose between the point's own value and `this.options`'.
 */
export interface DumbbellSeriesOptions {
  /** Low-end marker colour. Defaults to the series colour. */
  lowColor?: string;
  /** High-end marker colour (also the legend swatch). Defaults to the series colour. */
  highColor?: string;
  /** Connector line colour. */
  connectorColor?: string;
  /** Connector line thickness. */
  connectorWidth?: number;
}

/** Per-point overrides of the series' dumbbell colours/width. */
export interface DumbbellPointOptions {
  lowColor?: string;
  highColor?: string;
  connectorColor?: string;
  connectorWidth?: number;
}

export class DumbbellSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: true, cartesian: true, stackable: false };
  }

  protected override pointValues(p: Point): Array<number | undefined> {
    return [p.low, p.high];
  }

  override render(ctx: SeriesRenderContext): void {
    if (ctx.polar) {
      this.renderPolar(ctx);
      return;
    }
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    // Horizontal (inverted): category on y, value on x. Vertical: the reverse.
    const catScale = (inverted ? ctx.yScale : ctx.xScale) as CategoryScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group(
      { class: `facet-series facet-dumbbell ${this.name}` },
      renderer.root,
    );

    const band = catScale.bandwidth ? catScale.bandwidth() : 0;
    const subWidth = band / groupCount;
    const radius = this.options.marker?.radius ?? 5;
    const rectWidth = this.options.marker?.width ?? 5;
    const rectHeight = this.options.marker?.height ?? 5;
    const isRect =
      this.options.marker?.enabled !== false &&
      this.options.marker?.symbol === "rectangle";
    const markerHalfAlongValue = isRect
      ? (inverted ? rectWidth : rectHeight) / 2
      : radius;

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      // Point override > series option (itself already resolved against
      // plotOptions) > built-in default.
      const lowColor = p.options.lowColor ?? this.options.lowColor ?? this.color;
      const highColor = p.options.highColor ?? this.options.highColor ?? this.color;
      const connColor = p.options.connectorColor ?? this.options.connectorColor ?? THEME.neutralColor;
      const connWidth = p.options.connectorWidth ?? this.options.connectorWidth ?? 7;
      const cat =
        catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vLow = valScale.scale(p.low);
      const vHigh = valScale.scale(p.high);

      // Connector (along the value axis).
      const conn = isRect
        ? inverted
          ? {
              x1: vLow < vHigh ? vLow + markerHalfAlongValue : vLow - markerHalfAlongValue,
              y1: cat,
              x2: vLow < vHigh ? vHigh - markerHalfAlongValue : vHigh + markerHalfAlongValue,
              y2: cat,
            }
          : {
              x1: cat,
              y1: vLow < vHigh ? vLow + markerHalfAlongValue : vLow - markerHalfAlongValue,
              x2: cat,
              y2: vLow < vHigh ? vHigh - markerHalfAlongValue : vHigh + markerHalfAlongValue,
            }
        : inverted
          ? { x1: vLow, y1: cat, x2: vHigh, y2: cat }
          : { x1: cat, y1: vLow, x2: cat, y2: vHigh };
      renderer.create(
        "line",
        {
          ...conn,
          stroke: connColor,
          "stroke-width": connWidth,
        },
        g,
      );

      // End markers (both hoverable).
      for (const [v, color] of [
        [vLow, lowColor],
        [vHigh, highColor],
      ] as const) {
        const cx = inverted ? (v as number) : cat;
        const cy = inverted ? cat : (v as number);
        const marker = this.options.marker ?? {};
        const el = marker.enabled === false
          ? renderer.create("circle", {
              cx, cy, r: Math.max(8, radius), fill: "transparent",
              "pointer-events": "all", class: "facet-point-hit",
            }, g)
          : drawMarker(renderer, g, cx, cy, {
              symbol: marker.symbol ?? "circle",
              radius,
              fill: marker.fillColor ?? color as string,
              stroke: marker.lineColor ?? "#fff",
              strokeWidth: marker.lineWidth ?? 1.5,
              width: rectWidth,
              height: rectHeight,
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

      this.drawEndLabels(ctx, p, cat, valScale, inverted, radius);
    }
  }

  /** Draw each low/high pair along the category's radial spoke. */
  private renderPolar(ctx: SeriesRenderContext): void {
    if (ctx.inverted) {
      this.renderInvertedPolar(ctx);
      return;
    }
    const { renderer, groupCount, groupIndex } = ctx;
    const catScale = ctx.xScale as CategoryScale;
    const g = renderer.group(
      {
        class: `facet-series facet-dumbbell facet-polar-dumbbell ${this.name}`,
      },
      renderer.root,
    );
    const band = catScale.bandwidth ? catScale.bandwidth() : 0;
    const subWidth = band / groupCount;
    const radius = this.options.marker?.radius ?? 5;
    const rectWidth = this.options.marker?.width ?? 5;
    const rectHeight = this.options.marker?.height ?? 5;

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const lowColor =
        p.options.lowColor ?? this.options.lowColor ?? this.color;
      const highColor =
        p.options.highColor ?? this.options.highColor ?? this.color;
      const connColor =
        p.options.connectorColor ??
        this.options.connectorColor ??
        THEME.neutralColor;
      const connWidth =
        p.options.connectorWidth ?? this.options.connectorWidth ?? 7;
      const angle =
        catScale.scale(p.x) -
        band / 2 +
        (groupIndex + 0.5) * subWidth;
      const lowRadius = ctx.yScale.scale(p.low);
      const highRadius = ctx.yScale.scale(p.high);
      const low = projectPolar(ctx.plot, angle, lowRadius);
      const high = projectPolar(ctx.plot, angle, highRadius);

      renderer.create(
        "line",
        {
          x1: low.x,
          y1: low.y,
          x2: high.x,
          y2: high.y,
          stroke: connColor,
          "stroke-width": connWidth,
          class: "facet-dumbbell-connector",
        },
        g,
      );

      for (const [point, color] of [
        [low, lowColor],
        [high, highColor],
      ] as const) {
        const marker = this.options.marker ?? {};
        const el =
          marker.enabled === false
            ? renderer.create(
                "circle",
                {
                  cx: point.x,
                  cy: point.y,
                  r: Math.max(8, radius),
                  fill: "transparent",
                  "pointer-events": "all",
                  class: "facet-point-hit",
                },
                g,
              )
            : drawMarker(renderer, g, point.x, point.y, {
                symbol: marker.symbol ?? "circle",
                radius,
                fill: marker.fillColor ?? color,
                stroke: marker.lineColor ?? "#fff",
                strokeWidth: marker.lineWidth ?? 1.5,
                width: rectWidth,
                height: rectHeight,
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

      this.drawPolarEndLabels(
        ctx,
        p,
        angle,
        lowRadius,
        highRadius,
        radius,
      );
    }
  }

  /** In inverted polar mode the pair shares an x radius and spans y angles. */
  private renderInvertedPolar(ctx: SeriesRenderContext): void {
    const { renderer, groupCount, groupIndex } = ctx;
    const catScale = ctx.xScale as CategoryScale;
    const g = renderer.group(
      {
        class:
          `facet-series facet-dumbbell facet-polar-dumbbell ` +
          `facet-polar-inverted-dumbbell ${this.name}`,
      },
      renderer.root,
    );
    const center = polarCenter(ctx);
    const band = catScale.bandwidth ? catScale.bandwidth() : 0;
    const subWidth = band / groupCount;
    const markerRadius = this.options.marker?.radius ?? 5;
    const marker = this.options.marker ?? {};

    for (const p of this.points) {
      if (p.low === undefined || p.high === undefined) continue;
      const lowColor =
        p.options.lowColor ?? this.options.lowColor ?? this.color;
      const highColor =
        p.options.highColor ?? this.options.highColor ?? this.color;
      const connColor =
        p.options.connectorColor ??
        this.options.connectorColor ??
        THEME.neutralColor;
      const connWidth =
        p.options.connectorWidth ?? this.options.connectorWidth ?? 7;
      const radial =
        catScale.scale(p.x) -
        band / 2 +
        (groupIndex + 0.5) * subWidth;
      const lowAngle = ctx.yScale.scale(p.low);
      const highAngle = ctx.yScale.scale(p.high);
      const low = projectPolar(ctx.plot, lowAngle, radial);
      const high = projectPolar(ctx.plot, highAngle, radial);

      renderer.create(
        "path",
        {
          d: circularArcPath(
            center.x,
            center.y,
            radial,
            lowAngle,
            highAngle,
          ),
          fill: "none",
          stroke: connColor,
          "stroke-width": connWidth,
          class: "facet-dumbbell-connector facet-dumbbell-arc-connector",
        },
        g,
      );

      for (const [point, color] of [
        [low, lowColor],
        [high, highColor],
      ] as const) {
        const el =
          marker.enabled === false
            ? renderer.create(
                "circle",
                {
                  cx: point.x,
                  cy: point.y,
                  r: Math.max(8, markerRadius),
                  fill: "transparent",
                  "pointer-events": "all",
                  class: "facet-point-hit",
                },
                g,
              )
            : drawMarker(renderer, g, point.x, point.y, {
                symbol: marker.symbol ?? "circle",
                radius: markerRadius,
                fill: marker.fillColor ?? color,
                stroke: marker.lineColor ?? "#fff",
                strokeWidth: marker.lineWidth ?? 1.5,
                width: marker.width ?? 5,
                height: marker.height ?? 5,
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

      this.drawInvertedPolarEndLabels(
        ctx,
        p,
        radial,
        lowAngle,
        highAngle,
        markerRadius,
      );
    }
  }

  private drawInvertedPolarEndLabels(
    ctx: SeriesRenderContext,
    p: Point,
    radial: number,
    lowAngle: number,
    highAngle: number,
    markerRadius: number,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const labelRadius = radial + markerRadius + 6 + (dl.distance ?? 0);
    for (const [value, angle] of [
      [p.low!, lowAngle],
      [p.high!, highAngle],
    ] as const) {
      const point = projectPolar(ctx.plot, angle, labelRadius);
      const cosine = Math.cos(angle);
      drawDataLabel(
        ctx.renderer,
        ctx.renderer.root,
        labelString(dl, {
          x: p.x,
          y: value,
          low: p.low,
          high: p.high,
          point: p.options,
          series: this.name,
          name: p.name ?? p.x,
          index: p.index,
          color: p.color ?? this.color,
        }),
        {
          x: point.x,
          y: point.y + 4,
          anchor:
            cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle",
        },
        dl,
      );
    }
  }

  private drawPolarEndLabels(
    ctx: SeriesRenderContext,
    p: Point,
    angle: number,
    lowRadius: number,
    highRadius: number,
    markerRadius: number,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const distance = markerRadius + 6 + (dl.distance ?? 0);
    for (const [value, radial] of [
      [p.low!, lowRadius],
      [p.high!, highRadius],
    ] as const) {
      const outward = radial >= Math.max(lowRadius, highRadius);
      const point = projectPolar(
        ctx.plot,
        angle,
        radial + (outward ? distance : -distance),
      );
      const cosine = Math.cos(angle);
      const text = labelString(dl, {
        x: p.x,
        y: value,
        low: p.low,
        high: p.high,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? this.color,
      });
      drawDataLabel(
        ctx.renderer,
        ctx.renderer.root,
        text,
        {
          x: point.x,
          y: point.y + 4,
          anchor:
            cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle",
        },
        dl,
      );
    }
  }

  /** Labels at the low and high ends (both values shown by default). */
  private drawEndLabels(
    ctx: SeriesRenderContext,
    p: Point,
    cat: number,
    valScale: Scale,
    inverted: boolean,
    radius: number,
  ): void {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const ends: Array<{ val: number; isHigh: boolean }> = [
      { val: p.low!, isHigh: p.low! > p.high! },
      { val: p.high!, isHigh: p.low! < p.high! },
    ];
    for (const end of ends) {
      const v = valScale.scale(end.val);
      const text = labelString(dl, {
        x: p.x,
        y: end.val,
        low: p.low,
        high: p.high,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? this.color,
      });
      const d = dl.distance ?? 0;
      let place: LabelPlacement;
      if (inverted) {
        place = end.isHigh
          ? { x: v + radius + 6 + d, y: cat + 4, anchor: "start" }
          : { x: v - radius - 6 - d, y: cat + 4, anchor: "end" };
      } else {
        place = end.isHigh
          ? { x: cat, y: v - radius - 6 - d, anchor: "middle" }
          : { x: cat, y: v + radius + 14 + d, anchor: "middle", side: "down" };
      }
      drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
}
