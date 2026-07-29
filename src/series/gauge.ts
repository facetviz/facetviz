/**
 * Gauge (radial dial). Shows each series value on its own 180° arc from 180°
 * (left) to 360°/0° (right) between `min` and `max` (series options, default
 * 0–100). Gauges are laid out left-to-right, or top-to-bottom when the chart is
 * inverted. Each gauge has a coloured value band, optional reference markers,
 * min/max labels at the bottom corners, and a centre value readout.
 * Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { FONTS } from "../core/defaults.js";
import { THEME } from "../core/theme.js";
import type { Rect } from "../core/axis.js";
import type { Point } from "../core/point.js";

/** Per-gauge series options. */
export interface GaugeSeriesOptions {
  /** Minimum value of the gauge (default 0). */
  min?: number;
  /** Maximum value of the gauge (default 100). */
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** Single colour for the value band (default: series colour). */
  color?: string;
  /** Background track colour (default: theme grid line colour). */
  trackColor?: string;
  /** Band thickness in pixels (default: auto ~16% of radius). */
  thickness?: number;
  /** Reference markers on the band. May also be set via `plotOptions.gauge`. */
  markers?: Array<{
    /** Value at which to place the marker (between min and max). */
    value: number;
    /** Optional label override; defaults to the value. */
    label?: string;
    /** Optional colour for the marker line; defaults to band colour. */
    color?: string;
    /** Label position: 'outside' (default) or 'inside' the band. */
    labelPosition?: "outside" | "inside";
    /** Font Size: Increase or decrease the font size of marker. default 10px*/
    fontSize?: number;
  }>;
  /** Show min/max labels at bottom corners (default: true). */
  showMinMax?: boolean;
  /** Centre value formatter. Receives the numeric value, returns a string. */
  centerFormatter?: (value: number) => string;
  /** Centre value font size (default: auto ~22px). */
  centerFontSize?: number;
  /** Track/bg track opacity (default 0.15). */
  trackOpacity?: number;
}

/** SVG arc band (filled ring segment) between two radii. */
function arcBandPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  if (endDeg <= startDeg) return "";
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (endDeg * Math.PI) / 180;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const ox0 = cx + rOuter * Math.cos(a0);
  const oy0 = cy + rOuter * Math.sin(a0);
  const ox1 = cx + rOuter * Math.cos(a1);
  const oy1 = cy + rOuter * Math.sin(a1);
  const ix1 = cx + rInner * Math.cos(a1);
  const iy1 = cy + rInner * Math.sin(a1);
  const ix0 = cx + rInner * Math.cos(a0);
  const iy0 = cy + rInner * Math.sin(a0);
  return (
    `M ${ox0} ${oy0} ` +
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${ox1} ${oy1} ` +
    `L ${ix1} ${iy1} ` +
    `A ${rInner} ${rInner} 0 ${large} 0 ${ix0} ${iy0} Z`
  );
}

/** Point on circle at given degrees. */
function pointOnCircle(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export class GaugeSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot, inverted } = ctx;
    const g = renderer.group(
      { class: `facet-series facet-gauge ${this.name}` },
      renderer.root,
    );
    const points = this.visiblePoints();
    if (!points.length) return;
    const opts = this.options as GaugeSeriesOptions;

    points.forEach((p, index) => {
      const gaugePlot: Rect = inverted
        ? {
            x: plot.x,
            y: plot.y + (plot.height * index) / points.length,
            width: plot.width,
            height: plot.height / points.length,
          }
        : {
            x: plot.x + (plot.width * index) / points.length,
            y: plot.y,
            width: plot.width / points.length,
            height: plot.height,
          };
      const item = renderer.group(
        {
          class: "facet-gauge-item",
          "data-point-index": p.index,
        },
        g,
      );
      this.renderGauge(ctx, p, gaugePlot, item, opts);
    });
  }

  private renderGauge(
    ctx: SeriesRenderContext,
    p: Point,
    plot: Rect,
    g: SVGGElement,
    opts: GaugeSeriesOptions,
  ): void {
    const { renderer } = ctx;
    const min = opts.min ?? 0;
    const max = opts.max ?? 100;
    const minLabel = opts.minLabel ?? String(min);
    const maxLabel = opts.maxLabel ?? String(max);
    const value = Math.max(min, Math.min(max, p.y ?? 0));
    const frac = max === min ? 0 : (value - min) / (max - min);

    // Gauge geometry: 180° sweep from 180° (left) to 360° (right)
    const START_DEG = 180;
    const SWEEP_DEG = 180;
    const END_DEG = START_DEG + SWEEP_DEG; // 360

    const cx = plot.x + plot.width / 2;
    // Position centre lower so the arc sits in the upper portion of the plot area
    const cy = plot.y + plot.height * 0.7;
    const radius = Math.min(plot.width * 0.42, plot.height * 0.55);
    const requestedThickness = opts.thickness ?? Math.max(4, radius * 0.18);
    const thickness = Math.min(requestedThickness, radius * 0.8);
    const rOuter = radius;
    const rInner = radius - thickness;

    // Background track (full 180° arc)
    const trackColor = opts.trackColor ?? THEME.axis.gridLineColor;
    const trackOpacity = opts.trackOpacity ?? 0.15;
    renderer.create(
      "path",
      {
        d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, END_DEG),
        fill: trackColor,
        opacity: trackOpacity,
        stroke: "none",
      },
      g,
    );

    // Value band (from start to current value)
    const valueEndDeg = START_DEG + SWEEP_DEG * frac;
    const bandColor = p.color ?? this.color ?? opts.color;
    renderer.create(
      "path",
      {
        d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, valueEndDeg),
        fill: bandColor,
        stroke: "none",
      },
      g,
    );

    // Hover target (transparent path over the band area for events)
    const hitEl = renderer.create(
      "path",
      {
        d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, END_DEG),
        fill: "transparent",
        stroke: "none",
        class: "facet-point",
      },
      g,
    );
    ctx.registerHover(hitEl, p);
    hitEl.addEventListener("click", (e: Event) =>
      ctx.onPointEvent("click", p, e),
    );
    hitEl.addEventListener("mouseover", (e: Event) =>
      ctx.onPointEvent("mouseOver", p, e),
    );
    hitEl.addEventListener("mouseout", (e: Event) =>
      ctx.onPointEvent("mouseOut", p, e),
    );

    // Reference markers
    if (opts.markers && opts.markers.length) {
      const markers = opts.markers
        .map((m) => ({
          ...m,
          value: Math.max(min, Math.min(max, m.value)),
          label: m.label ?? String(m.value),
          color: m.color ?? bandColor,
          labelPosition: m.labelPosition ?? "outside",
          fontSize: m.fontSize ?? 10,
        }))
        .sort((a, b) => a.value - b.value);

      for (const m of markers) {
        const mFrac = max === min ? 0 : (m.value - min) / (max - min);
        const mDeg = START_DEG + SWEEP_DEG * mFrac;
        const lineOuter = rOuter + 2;
        const lineInner = rInner - 2;

        // Marker line
        const pOuter = pointOnCircle(cx, cy, lineOuter, mDeg);
        const pInner = pointOnCircle(cx, cy, lineInner, mDeg);
        renderer.create(
          "line",
          {
            x1: pInner.x,
            y1: pInner.y,
            x2: pOuter.x,
            y2: pOuter.y,
            stroke: m.color,
            "stroke-width": 2,
            "stroke-linecap": "round",
            class: "facet-gauge-marker",
          },
          g,
        );

        // Marker label
        const labelRadius =
          m.labelPosition === "inside" ? (rInner + rOuter) / 2 : rOuter + 18;
        const labelPt = pointOnCircle(cx, cy, labelRadius, mDeg);
        const isRightSide = mDeg > 270 && mDeg < 360;
        const isLeftSide = mDeg > 180 && mDeg < 270;
        const anchor = isRightSide ? "start" : isLeftSide ? "end" : "middle";
        const dx = isRightSide ? 4 : isLeftSide ? -4 : 0;
        renderer.text(
          m.label,
          labelPt.x + dx,
          labelPt.y + 4,
          {
            "text-anchor": anchor,
            ...FONTS.dataLabel,
            "font-size": `${m.fontSize}px`,
            fill: m.color,
            class: "facet-gauge-marker-label",
          },
          g,
        );
      }
    }

    // Min / Max labels at bottom corners
    if (opts.showMinMax !== false) {
      // const labelGap = Math.max(6, Math.min(22, radius * 0.28));
      // Min at 180° (left)
      const minPt = pointOnCircle(
        cx,
        cy,
        rOuter - (rOuter - rInner) / 2,
        START_DEG,
      );
      renderer.text(
        minLabel,
        minPt.x,
        minPt.y + 20,
        {
          "text-anchor": "middle",
          ...FONTS.dataLabel,
          "font-size": "11px",
          fill: THEME.axis.labelColor,
        },
        g,
      );

      // Max at 360° (right)
      const maxPt = pointOnCircle(
        cx,
        cy,
        rInner + (rOuter - rInner) / 2,
        END_DEG,
      ); // + labelGap, END_DEG);
      renderer.text(
        maxLabel,
        maxPt.x,
        maxPt.y + 20,
        {
          "text-anchor": "middle",
          ...FONTS.dataLabel,
          "font-size": "11px",
          fill: THEME.axis.labelColor,
        },
        g,
      );
    }

    // Centre value readout
    const centerValue = opts.centerFormatter
      ? opts.centerFormatter(value)
      : String(value);
    const centerFontSize =
      opts.centerFontSize ?? Math.max(10, Math.min(22, radius * 0.32));
    renderer.text(
      centerValue,
      cx,
      cy - rInner / 2 + centerFontSize / 2,
      {
        "text-anchor": "middle",
        ...FONTS.title,
        "font-size": `${centerFontSize}px`,
        fill: THEME.axis.titleColor,
        class: "facet-gauge-value",
      },
      g,
    );

    // Optional series/point name under the value
    if (p.name ?? this.name) {
      renderer.text(
        String(p.name ?? this.name),
        cx,
        cy,
        {
          "text-anchor": "middle",
          ...FONTS.subtitle,
          fill: THEME.axis.labelColor,
          class: "facet-gauge-label",
        },
        g,
      );
    }
  }
}
