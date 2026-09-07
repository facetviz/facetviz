/**
 * Gauge (radial dial). Shows each series value on its own arc between `min`
 * and `max` (series options, default 0–100). The default arc spans 180° from
 * 180° (left) to 360°/0° (right); callers can configure any sweep up to a
 * complete circle. Gauges are laid out left-to-right, or top-to-bottom when the chart is
 * inverted. Each gauge has a coloured value band, optional reference markers,
 * min/max labels at the bottom corners, and a centre value readout.
 * Self-contained (non-cartesian).
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from "./base.js";
import { FONTS } from "../core/defaults.js";
import { THEME, scaledFontPx } from "../core/theme.js";
import { sanitizeStyle } from "../core/utils.js";
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
  /** Give open track and value-band ends circular caps (default: false). */
  roundedEnds?: boolean;
  /** Arc start in degrees (default 180, at 9 o'clock). */
  startAngle?: number;
  /** Arc end in degrees (default 360, at 3 o'clock). The sweep may be up to 360°. */
  endAngle?: number;
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
    /** CSS font size, e.g. '14px'. Default '10px'. */
    fontSize?: string;
  }>;
  /** Show min/max labels at the band ends (default: true). */
  showMinMax?: boolean;
  /** Show the minimum label. `showMinMax: false` takes precedence. */
  showMinLabel?: boolean;
  /** Show the maximum label. `showMinMax: false` takes precedence. */
  showMaxLabel?: boolean;
  /** Centre value formatter. Receives the numeric value, returns a string. */
  centerFormatter?: (value: number) => string;
  /** CSS centre value font size, e.g. '20px' (default: auto ~10-22px, from the dial's own radius). */
  centerFontSize?: string;
  /** Position of the point/series name within each gauge (default: 'center'). */
  namePosition?: "top" | "center" | "bottom";
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
  const sweep = endDeg - startDeg;
  // SVG cannot draw a complete circle with one arc because its end points
  // coincide. Split a full ring into two arcs instead.
  if (sweep >= 360 - 1e-6) {
    const mid = a0 + Math.PI;
    const ox0 = cx + rOuter * Math.cos(a0);
    const oy0 = cy + rOuter * Math.sin(a0);
    const oxm = cx + rOuter * Math.cos(mid);
    const oym = cy + rOuter * Math.sin(mid);
    const ix0 = cx + rInner * Math.cos(a0);
    const iy0 = cy + rInner * Math.sin(a0);
    const ixm = cx + rInner * Math.cos(mid);
    const iym = cy + rInner * Math.sin(mid);
    return (
      `M ${ox0} ${oy0} ` +
      `A ${rOuter} ${rOuter} 0 0 1 ${oxm} ${oym} ` +
      `A ${rOuter} ${rOuter} 0 0 1 ${ox0} ${oy0} ` +
      `L ${ix0} ${iy0} ` +
      `A ${rInner} ${rInner} 0 0 0 ${ixm} ${iym} ` +
      `A ${rInner} ${rInner} 0 0 0 ${ix0} ${iy0} Z`
    );
  }
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

    // Defaults preserve the existing 180° dial. Callers can choose any
    // positive sweep up to 360° with startAngle/endAngle.
    const START_DEG = opts.startAngle ?? 180;
    const END_DEG = opts.endAngle ?? 360;
    const SWEEP_DEG = END_DEG - START_DEG;
    if (
      !Number.isFinite(START_DEG) ||
      !Number.isFinite(END_DEG) ||
      SWEEP_DEG <= 0 ||
      SWEEP_DEG > 360
    ) {
      throw new RangeError(
        "FacetViz: gauge startAngle/endAngle must define a positive sweep of at most 360 degrees",
      );
    }
    const isFullCircle = SWEEP_DEG >= 360 - 1e-6;
    const namePosition = opts.namePosition ?? "center";

    const cx = plot.x + plot.width / 2;
    // A semicircle sits above a lower centre; a full circle needs equal room
    // on every side of a true centre.
    const cy = plot.y + plot.height * (isFullCircle ? 0.5 : 0.7);
    const radius = isFullCircle
      ? Math.min(plot.width, plot.height) * 0.42
      : Math.min(plot.width * 0.42, plot.height * 0.55);
    const requestedThickness = opts.thickness ?? Math.max(4, radius * 0.18);
    const thickness = Math.min(requestedThickness, radius * 0.8);
    const rOuter = radius;
    const rInner = radius - thickness;
    const roundedEnds = opts.roundedEnds === true;
    const capRadius = thickness / 2;
    const capCentreRadius = (rInner + rOuter) / 2;
    const addCaps = (
      startDeg: number,
      endDeg: number,
      color: string,
      opacity: number | undefined,
      className: string,
    ) => {
      if (!roundedEnds || endDeg <= startDeg) return;
      for (const deg of [startDeg, endDeg]) {
        const cap = pointOnCircle(cx, cy, capCentreRadius, deg);
        renderer.create(
          "circle",
          {
            cx: cap.x,
            cy: cap.y,
            r: capRadius,
            fill: color,
            ...(opacity === undefined ? {} : { opacity }),
            class: `facet-gauge-cap ${className}`,
          },
          g,
        );
      }
    };

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
    if (!isFullCircle)
      addCaps(START_DEG, END_DEG, trackColor, trackOpacity, "facet-gauge-track-cap");

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
    // A zero value has no band to cap; a completed full-circle band has no
    // open ends. Partial bands (including a completed semicircle) cap both.
    if (valueEndDeg > START_DEG && !(isFullCircle && frac >= 1))
      addCaps(START_DEG, valueEndDeg, bandColor, undefined, "facet-gauge-value-cap");

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
          // Scaled/clamped like any other font-size option (sanitizeStyle),
          // rather than the literal pixel value rendered verbatim.
          fontSize: sanitizeStyle({ "font-size": m.fontSize ?? "10px" })["font-size"],
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
        const isRightSide = Math.cos((mDeg * Math.PI) / 180) > 0.2;
        const isLeftSide = Math.cos((mDeg * Math.PI) / 180) < -0.2;
        const anchor = isRightSide ? "start" : isLeftSide ? "end" : "middle";
        const dx = isRightSide ? 4 : isLeftSide ? -4 : 0;
        renderer.text(
          m.label,
          labelPt.x + dx,
          labelPt.y + 4,
          {
            "text-anchor": anchor,
            ...FONTS.dataLabel,
            "font-size": m.fontSize,
            fill: m.color,
            class: "facet-gauge-marker-label",
          },
          g,
        );
      }
    }

    // A full circle has a shared start/end seam, so separate its labels.
    if (opts.showMinMax !== false && (opts.showMinLabel !== false || opts.showMaxLabel !== false)) {
      const labelRadius = isFullCircle
        ? rOuter + Math.max(14, thickness * 0.75)
        : rOuter - (rOuter - rInner) / 2;
      const minPt = pointOnCircle(
        cx, cy, labelRadius, isFullCircle ? START_DEG - 18 : START_DEG,
      );
      if (opts.showMinLabel !== false) {
        renderer.text(
          minLabel,
          minPt.x,
          minPt.y + (isFullCircle ? 4 : 20),
          {
            "text-anchor": "middle",
            ...FONTS.dataLabel,
            "font-size": scaledFontPx(11),
            fill: THEME.axis.labelColor,
          },
          g,
        );
      }

      const maxPt = pointOnCircle(
        cx, cy, labelRadius, isFullCircle ? END_DEG + 18 : END_DEG,
      );
      if (opts.showMaxLabel !== false) {
        renderer.text(
          maxLabel,
          maxPt.x,
          maxPt.y + (isFullCircle ? 4 : 20),
          {
            "text-anchor": "middle",
            ...FONTS.dataLabel,
            "font-size": scaledFontPx(11),
            fill: THEME.axis.labelColor,
          },
          g,
        );
      }
    }

    // Centre value readout
    const centerValue = opts.centerFormatter
      ? opts.centerFormatter(value)
      : String(value);
    // An explicit centerFontSize is a caller override, scaled/clamped like
    // any other font-size option; the auto default instead derives from the
    // gauge's own rendered radius, which is already proportional to the
    // chart's size -- scaling it a second time would double-apply.
    const centerFontSize = opts.centerFontSize
      ? parseFloat(sanitizeStyle({ "font-size": opts.centerFontSize })["font-size"])
      : Math.max(10, Math.min(22, radius * 0.32));
    const valueY = namePosition === "center"
      ? isFullCircle
        ? cy - 4
        : cy - rInner / 2 + centerFontSize / 2
      : cy;
    renderer.text(
      centerValue,
      cx,
      valueY,
      {
        "text-anchor": "middle",
        ...FONTS.title,
        "font-size": `${centerFontSize}px`,
        fill: THEME.axis.titleColor,
        class: "facet-gauge-value",
      },
      g,
    );

    // Optional series/point name. The centre position preserves the previous
    // layout, while top and bottom position it against the item bounds.
    if (p.name ?? this.name) {
      const nameFontSize = parseFloat(FONTS.subtitle["font-size"] ?? "12") || 12;
      const nameY = namePosition === "top"
        ? plot.y + nameFontSize
        : namePosition === "bottom"
          ? plot.y + plot.height - nameFontSize / 2
          : isFullCircle
            ? cy + centerFontSize + 4
            : cy;
      renderer.text(
        String(p.name ?? this.name),
        cx,
        nameY,
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
