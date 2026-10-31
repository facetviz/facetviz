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
  /** Band thickness: pixels, or a percentage of the radius such as `'20%'`
   * (default: auto ~18% of radius). */
  thickness?: number | string;
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
    /** Optional colour for the marker line and label; defaults to the axis title colour. */
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
  /** Coloured stretches of the dial (zones such as red / amber / green),
   * drawn over the track. Values are clamped to min–max. */
  bands?: Array<{
    from: number;
    to: number;
    color: string;
    /** Opacity (default 1 without a value band, 0.35 under one). */
    opacity?: number;
  }>;
  /** A pointer from the centre to the value. `true` uses the defaults. */
  needle?:
    | boolean
    | {
        /** Default: the theme's title colour. */
        color?: string;
        /** Width at the hub in pixels (default ~5% of the radius, at least 3). */
        width?: number;
        /** Reach as a fraction of the radius (default: the band's middle). */
        length?: number;
      };
  /** Draw the coloured band from min to the value (default: true, false
   * with a needle). */
  valueBand?: boolean;
}

/** The needle option filled in, or null without one. */
function needleOf(n: GaugeSeriesOptions["needle"]): { color?: string; width?: number; length?: number } | null {
  if (!n) return null;
  return n === true ? {} : n;
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

/** The box (unit radius, centre at 0,0) holding an arc from `s` to `e`
 * degrees and its centre: its ends and the 3/6/9/12 o'clock points it
 * passes. */
function arcExtent(s: number, e: number): { x0: number; x1: number; y0: number; y1: number } {
  const xs = [0];
  const ys = [0];
  const add = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    xs.push(Math.cos(a));
    ys.push(Math.sin(a));
  };
  add(s);
  add(e);
  for (let k = Math.ceil(s / 90) * 90; k <= e; k += 90) add(k);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** A band from `d0` to `d1` degrees with its corners rounded at each end
 * asked for: by half its thickness (a round end) on a thin band, by at most
 * `maxCorner` on a thick one. The rounding stays inside the end's angle, so
 * the band reads the value it ends at. */
function roundedBandPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  d0: number,
  d1: number,
  roundStart: boolean,
  roundEnd: boolean,
  maxCorner = Infinity,
): string {
  if (d1 <= d0) return "";
  if ((!roundStart && !roundEnd) || d1 - d0 >= 360 - 1e-6) return arcBandPath(cx, cy, rInner, rOuter, d0, d1);
  const a0 = (d0 * Math.PI) / 180;
  const a1 = (d1 * Math.PI) / 180;
  const span = a1 - a0;
  const ends = (roundStart ? 1 : 0) + (roundEnd ? 1 : 0);
  const half = Math.sin(Math.min(span / ends, Math.PI) / 2);
  const want = Math.min(maxCorner, (rOuter - rInner) / 2);
  // Each corner's circle touches the end's edge and the arc; it shrinks to
  // what the band's angle leaves room for.
  const rco = Math.max(0, Math.min(want, (rOuter * half) / (1 + half)));
  const rci = Math.max(0, Math.min(want, half < 1 ? (rInner * half) / (1 - half) : want));
  const dO = rco > 0 ? Math.asin(rco / (rOuter - rco)) : 0;
  const dI = rci > 0 ? Math.asin(rci / (rInner + rci)) : 0;
  const lineO = (rOuter - rco) * Math.cos(dO);
  const lineI = (rInner + rci) * Math.cos(dI);
  const at = (r: number, a: number) => `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
  const oStart = roundStart ? a0 + dO : a0;
  const oEnd = roundEnd ? a1 - dO : a1;
  const iStart = roundStart ? a0 + dI : a0;
  const iEnd = roundEnd ? a1 - dI : a1;
  const parts = [
    roundStart ? `M ${at(lineO, a0)} A ${rco} ${rco} 0 0 1 ${at(rOuter, oStart)}` : `M ${at(rOuter, a0)}`,
    `A ${rOuter} ${rOuter} 0 ${oEnd - oStart > Math.PI ? 1 : 0} 1 ${at(rOuter, oEnd)}`,
    roundEnd ? `A ${rco} ${rco} 0 0 1 ${at(lineO, a1)} L ${at(lineI, a1)} A ${rci} ${rci} 0 0 1 ${at(rInner, iEnd)}` : `L ${at(rInner, a1)}`,
    `A ${rInner} ${rInner} 0 ${iEnd - iStart > Math.PI ? 1 : 0} 0 ${at(rInner, iStart)}`,
    roundStart ? `A ${rci} ${rci} 0 0 1 ${at(lineI, a0)}` : "",
    "Z",
  ];
  return parts.filter(Boolean).join(" ");
}

/** `text` cut with … to fit `room` px. */
function fitText(text: string, room: number, width: (t: string) => number): string {
  if (width(text) <= room) return text;
  let cut = text;
  while (cut.length > 1 && width(`${cut}…`) > room) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Band thickness in pixels: a number as is, a percentage string of the
 * radius, else the automatic ~18% (at least 4px). */
function gaugeThickness(thickness: number | string | undefined, radius: number): number {
  if (typeof thickness === "number" && Number.isFinite(thickness)) return thickness;
  if (typeof thickness === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(thickness);
    if (m) return (radius * Number(m[1])) / 100;
    const px = Number(thickness);
    if (thickness.trim() && Number.isFinite(px)) return px;
  }
  return Math.max(4, radius * 0.18);
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

    // Several gauges keep a small gap between them.
    const gap = points.length > 1 ? 0.03 : 0;
    points.forEach((p, index) => {
      const cell: Rect = inverted
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
      const gaugePlot: Rect = inverted
        ? { ...cell, y: cell.y + cell.height * gap, height: cell.height * (1 - 2 * gap) }
        : { ...cell, x: cell.x + cell.width * gap, width: cell.width * (1 - 2 * gap) };
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
    // The real value is written; the dial draws it clamped to its range,
    // with a mark when it's past either end.
    const raw = p.y ?? 0;
    const value = Math.max(min, Math.min(max, raw));
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
    const isHalf = START_DEG === 180 && END_DEG === 360;
    // Wider than a half: the value sits at the centre, as in a full circle.
    const isWide = SWEEP_DEG > 180 + 1e-6;
    const namePosition = opts.namePosition ?? "center";
    const needle = needleOf(opts.needle);
    const showValueBand = opts.valueBand ?? !needle;
    const roundedEnds = opts.roundedEnds === true;
    const degOf = (v: number) =>
      START_DEG + SWEEP_DEG * (max === min ? 0 : (Math.max(min, Math.min(max, v)) - min) / (max - min));
    const valueEndDeg = START_DEG + SWEEP_DEG * frac;
    const bandColor = p.color ?? this.color ?? opts.color;

    // Texts, measured once: the layout fits them all inside the gauge's box.
    const endAttrs = { ...FONTS.dataLabel, "font-size": scaledFontPx(11) };
    const nameAttrs = { ...FONTS.subtitle };
    const nameFontSize = parseFloat(String(FONTS.subtitle["font-size"] ?? "12")) || 12;
    const centerValue = opts.centerFormatter ? opts.centerFormatter(raw) : String(raw);
    const off = raw > max ? "▲" : raw < min ? "▼" : "";
    const showMin = opts.showMinMax !== false && opts.showMinLabel !== false;
    const showMax = opts.showMinMax !== false && opts.showMaxLabel !== false;
    const minSize = renderer.measureText(minLabel, endAttrs);
    const maxSize = renderer.measureText(maxLabel, endAttrs);
    const range = Math.abs(max - min) || 1;
    const markers = (opts.markers ?? [])
      .map((m) => {
        const fontSize = sanitizeStyle({ "font-size": m.fontSize ?? "10px" })["font-size"];
        const label = m.label ?? String(m.value);
        const attrs = { ...FONTS.dataLabel, "font-size": fontSize };
        // A label saying what the end label already says, at that end, is left out.
        const atEnd =
          (showMin && label === minLabel && Math.abs(m.value - min) <= range * 0.02) ||
          (showMax && label === maxLabel && Math.abs(m.value - max) <= range * 0.02);
        return {
          deg: degOf(m.value),
          label,
          showLabel: !atEnd && label !== "",
          color: m.color ?? THEME.axis.titleColor,
          inside: m.labelPosition === "inside",
          attrs,
          size: renderer.measureText(label, attrs),
        };
      })
      .sort((a, b) => a.deg - b.deg);
    const nameText = p.name ?? this.name;
    const nameSize = nameText ? renderer.measureText(String(nameText), nameAttrs) : { width: 0, height: 0 };
    const topReserve = nameText && namePosition === "top" ? nameFontSize + 6 : 0;
    const bottomReserve = nameText && namePosition === "bottom" ? nameFontSize + 6 : 0;
    const nameInside = !!nameText && namePosition === "center";

    type Box = { x0: number; x1: number; y0: number; y1: number };
    const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const textBox = (x: number, y: number, w: number, h: number, anchor: "start" | "middle" | "end"): Box => {
      const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      return { x0, x1: x0 + w, y0: y - h * 0.8, y1: y + h * 0.2 };
    };
    const ext = arcExtent(START_DEG, END_DEG);
    /** Whether a box round the centre reaches into the band: a point of it
     * in a direction the dial covers, between its inner and outer radius. */
    const crossesBand = (b: Box, r: number, rInner: number) => {
      const xs = [b.x0, (b.x0 + b.x1) / 2, b.x1];
      const ys = [b.y0, (b.y0 + b.y1) / 2, b.y1];
      return xs.some((x) =>
        ys.some((y) => {
          const d = Math.hypot(x, y);
          if (d <= rInner - 1 || d >= r + 1) return false;
          let deg = (Math.atan2(y, x) * 180) / Math.PI;
          while (deg < START_DEG) deg += 360;
          return deg <= END_DEG;
        }),
      );
    };

    /** Everything placed round a centre at 0,0 for an outer radius `r`. */
    const lay = (r: number, labels: boolean) => {
      const t = Math.min(gaugeThickness(opts.thickness, r), r * 0.8);
      const rInner = r - t;
      const rMid = r - t / 2;
      const boxes: Box[] = [{ x0: ext.x0 * r, x1: ext.x1 * r, y0: ext.y0 * r, y1: ext.y1 * r }];
      const hub = needle ? (needle.width ?? Math.max(3, r * 0.05)) * 1.3 : 0;
      // Under the dial (a half dial whose thick band leaves no bowl) the
      // value keeps its size; in the bowl or the centre it fits the hole.
      const below = !needle && namePosition === "center" && !isFullCircle && !isWide && rInner < Math.min(22, r * 0.32) + nameFontSize + 10;
      const font = opts.centerFontSize
        ? parseFloat(sanitizeStyle({ "font-size": opts.centerFontSize })["font-size"])
        : Math.max(11, Math.min(22, r * 0.32, below || (needle && !isFullCircle && !isWide) ? Infinity : rInner * 0.45));
      const valueWidth = renderer.measureText(`${centerValue}${off ? " " + off : ""}`, { ...FONTS.title, "font-size": `${font}px` }).width;
      // The value, and the name under it, in the bowl, under the hub or at
      // the centre; under the dial when a thick band leaves no bowl.
      let valueY: number;
      let nameY: number;
      if (needle) {
        valueY = isFullCircle ? Math.max(hub + font, rInner * 0.5) : isWide ? Math.max(hub + font + 2, rInner * 0.55) : hub + font + 2;
        nameY = valueY + nameFontSize + 4;
      } else if (namePosition !== "center") {
        valueY = isFullCircle || isWide ? font / 3 : -rInner / 2 + font / 2;
        nameY = 0;
      } else if (isFullCircle || isWide) {
        valueY = -4;
        nameY = font + 4;
      } else if (!below) {
        valueY = -rInner / 2 + font / 2;
        nameY = 0;
      } else {
        valueY = font + 8;
        nameY = valueY + nameFontSize + 4;
      }
      const valueBox = textBox(0, valueY, valueWidth, font, "middle");
      boxes.push(valueBox);

      const ends: { text: string; x: number; y: number; box: Box }[] = [];
      if (labels) {
        const put = (text: string, size: { width: number; height: number }, deg: number, side: 1 | -1) => {
          let x: number;
          let y: number;
          if (isFullCircle) {
            // Either side of the seam: the start's on the side the dial runs to.
            const lr = r + Math.max(14, t * 0.75);
            const d = deg + side * ((Math.asin(Math.min(1, (size.width / 2 + 4) / lr)) * 180) / Math.PI);
            ({ x, y } = pointOnCircle(0, 0, lr, d));
            y += 4;
          } else {
            ({ x, y } = pointOnCircle(0, 0, rMid, deg));
            // Under each end; a slanted end reaches lower, by half the band.
            y += isHalf ? 20 : t / 2 + 14;
          }
          ends.push({ text, x, y, box: textBox(x, y, size.width, size.height, "middle") });
        };
        if (showMin) put(minLabel, minSize, START_DEG, 1);
        if (showMax) put(maxLabel, maxSize, END_DEG, -1);
        for (const e of ends) boxes.push(e.box);
      }

      // The name under the value, unless it would cross the band or an end
      // label: then under the whole dial.
      if (nameInside) {
        let box = textBox(0, nameY, nameSize.width, nameFontSize, "middle");
        if (crossesBand(box, r, rInner) || ends.some((e) => overlaps(e.box, box))) {
          nameY = Math.max(...boxes.map((b) => b.y1)) + nameFontSize + 2;
          box = textBox(0, nameY, nameSize.width, nameFontSize, "middle");
        }
        boxes.push(box);
      }

      // Markers: a tick across the band, its label outside (or in the band
      // when it fits), moved along the dial clear of the others, else left out.
      const placedMarkers: { deg: number; label?: { x: number; y: number; anchor: "start" | "middle" | "end"; inside: boolean; deg: number } }[] = [];
      const taken: Box[] = ends.map((e) => e.box);
      for (const m of markers) {
        boxes.push({ x0: Math.cos((m.deg * Math.PI) / 180) * (r + 2) - 1, x1: Math.cos((m.deg * Math.PI) / 180) * (r + 2) + 1, y0: Math.sin((m.deg * Math.PI) / 180) * (r + 2) - 1, y1: Math.sin((m.deg * Math.PI) / 180) * (r + 2) + 1 });
        const placed: (typeof placedMarkers)[number] = { deg: m.deg };
        if (labels && m.showLabel) {
          if (m.inside && m.size.width <= t * 1.6) {
            const pt = pointOnCircle(0, 0, rMid, m.deg);
            placed.label = { x: pt.x, y: pt.y, anchor: "middle", inside: true, deg: m.deg };
          } else {
            const lr = r + 18;
            // The nearest free place, either way along the dial.
            for (let step = 0; step <= 24; step++) {
              const deg = m.deg + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 2;
              const pt = pointOnCircle(0, 0, lr, deg);
              const c = Math.cos((deg * Math.PI) / 180);
              const anchor = c > 0.2 ? "start" : c < -0.2 ? "end" : "middle";
              const x = pt.x + (anchor === "start" ? 4 : anchor === "end" ? -4 : 0);
              const box = textBox(x, pt.y + 4, m.size.width, m.size.height, anchor);
              if (taken.some((b) => overlaps(b, box))) continue;
              taken.push(box);
              boxes.push(box);
              placed.label = { x, y: pt.y + 4, anchor, inside: false, deg };
              break;
            }
          }
        }
        placedMarkers.push(placed);
      }
      return { r, t, rInner, rMid, hub, font, valueY, nameY, ends, markers: placedMarkers, boxes };
    };

    // The largest radius whose dial and texts all fit; on a dial too small
    // for its labels, they're left out (the tooltip still has them).
    const W = plot.width * 0.94;
    const H = Math.max(8, (plot.height - topReserve - bottomReserve) * 0.94);
    const span = (L: ReturnType<typeof lay>) => {
      const x0 = Math.min(...L.boxes.map((b) => b.x0));
      const x1 = Math.max(...L.boxes.map((b) => b.x1));
      const y0 = Math.min(...L.boxes.map((b) => b.y0));
      const y1 = Math.max(...L.boxes.map((b) => b.y1));
      return { x0, x1, y0, y1 };
    };
    const fit = (labels: boolean) => {
      let lo = 4;
      let hi = Math.max(4, Math.min(plot.width, plot.height));
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        const b = span(lay(mid, labels));
        if (b.x1 - b.x0 <= W && b.y1 - b.y0 <= H) lo = mid;
        else hi = mid;
      }
      return lay(lo, labels);
    };
    let L = fit(true);
    if (L.r < 36 && (L.ends.length || markers.some((m) => m.showLabel))) {
      const bare = fit(false);
      if (bare.r > L.r) L = bare;
    }
    const box = span(L);
    const cx = plot.x + (plot.width - (box.x1 - box.x0)) / 2 - box.x0;
    const cy = plot.y + topReserve + (plot.height - topReserve - bottomReserve - (box.y1 - box.y0)) / 2 - box.y0;
    const { r: rOuter, rInner, t: thickness, rMid } = L;

    // A band from d0 to d1, rounded (when asked) only at the dial's own
    // ends: one path each, so its caps don't stack over what's under them.
    // A thick band's ends are rounded corners, not a round blob.
    const corner = Math.max(6, rOuter * 0.12);
    const band = (d0: number, d1: number) =>
      roundedBandPath(cx, cy, rInner, rOuter, d0, d1, roundedEnds && !isFullCircle && d0 <= START_DEG + 1e-9, roundedEnds && !isFullCircle && d1 >= END_DEG - 1e-9, corner);

    // Background track
    const trackColor = opts.trackColor ?? THEME.axis.gridLineColor;
    const trackOpacity = opts.trackOpacity ?? 0.15;
    renderer.create(
      "path",
      { d: band(START_DEG, END_DEG), fill: trackColor, opacity: trackOpacity, stroke: "none", class: "facet-gauge-track" },
      g,
    );

    // Zones over the track.
    for (const b of opts.bands ?? []) {
      const d0 = degOf(Math.min(b.from, b.to));
      const d1 = degOf(Math.max(b.from, b.to));
      if (d1 <= d0) continue;
      renderer.create(
        "path",
        { d: band(d0, d1), fill: b.color, opacity: b.opacity ?? (showValueBand ? 0.35 : 1), stroke: "none", class: "facet-gauge-band" },
        g,
      );
    }

    // Value band, from the start to the value; rounded at the value too, its
    // cap ending on the value's angle.
    if (showValueBand && valueEndDeg > START_DEG) {
      const roundValue = roundedEnds && !(isFullCircle && frac >= 1);
      renderer.create(
        "path",
        {
          d: roundedBandPath(cx, cy, rInner, rOuter, START_DEG, valueEndDeg, roundValue && !isFullCircle, roundValue, corner),
          fill: bandColor,
          stroke: "none",
          class: "facet-gauge-value-band",
        },
        g,
      );
    }

    // Hover target (transparent path over the band area for events)
    const hitEl = renderer.create(
      "path",
      { d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, END_DEG), fill: "transparent", stroke: "none", class: "facet-point" },
      g,
    );
    ctx.registerHover(hitEl, p);
    hitEl.addEventListener("click", (e: Event) => ctx.onPointEvent("click", p, e));
    hitEl.addEventListener("mouseover", (e: Event) => ctx.onPointEvent("mouseOver", p, e));
    hitEl.addEventListener("mouseout", (e: Event) => ctx.onPointEvent("mouseOut", p, e));

    // Reference markers: a tick with a thin halo so it reads on any band.
    const halo = { stroke: THEME.backgroundColor, "paint-order": "stroke", "stroke-linejoin": "round" };
    markers.forEach((m, k) => {
      const placed = L.markers[k];
      const pOuter = pointOnCircle(cx, cy, rOuter + 2, m.deg);
      const pInner = pointOnCircle(cx, cy, rInner - 2, m.deg);
      const line = { x1: pInner.x, y1: pInner.y, x2: pOuter.x, y2: pOuter.y, "stroke-linecap": "round" };
      renderer.create("line", { ...line, stroke: THEME.backgroundColor, "stroke-width": 4, class: "facet-gauge-marker-halo" }, g);
      renderer.create("line", { ...line, stroke: m.color, "stroke-width": 2, class: "facet-gauge-marker" }, g);
      const lab = placed?.label;
      if (!lab) return;
      // A label moved along the dial keeps a thin line back to its tick.
      if (!lab.inside && Math.abs(lab.deg - m.deg) > 1e-6) {
        const from = pointOnCircle(cx, cy, rOuter + 3, m.deg);
        const to = pointOnCircle(cx, cy, rOuter + 12, lab.deg);
        renderer.create("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: m.color, "stroke-width": 0.75, opacity: 0.6, class: "facet-gauge-marker-leader" }, g);
      }
      renderer.text(
        m.label,
        cx + lab.x,
        cy + lab.y,
        {
          "text-anchor": lab.anchor,
          ...m.attrs,
          fill: lab.inside ? THEME.axis.titleColor : m.color,
          ...(lab.inside ? { "dominant-baseline": "central", ...halo, "stroke-width": 3 } : {}),
          class: "facet-gauge-marker-label",
        },
        g,
      );
    });

    // Needle: a tapered pointer from the hub to the value, over the band.
    if (needle) {
      const color = needle.color ?? THEME.axis.titleColor;
      const width = needle.width ?? Math.max(3, rOuter * 0.05);
      const reach = needle.length != null ? rOuter * needle.length : rMid;
      const tip = pointOnCircle(cx, cy, reach, valueEndDeg);
      const left = pointOnCircle(cx, cy, width / 2, valueEndDeg - 90);
      const right = pointOnCircle(cx, cy, width / 2, valueEndDeg + 90);
      renderer.create(
        "path",
        {
          d: `M ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y} Z`,
          fill: color,
          stroke: color,
          "stroke-width": 1,
          "stroke-linejoin": "round",
          class: "facet-gauge-needle",
        },
        g,
      );
      renderer.create("circle", { cx, cy, r: L.hub, fill: color, class: "facet-gauge-needle-hub" }, g);
    }

    // End labels: under the dial's ends, or either side of a full circle's seam.
    for (const e of L.ends) {
      renderer.text(e.text, cx + e.x, cy + e.y, { "text-anchor": "middle", ...endAttrs, fill: THEME.axis.labelColor, class: "facet-gauge-end-label" }, g);
    }

    // Centre value readout: the real value, marked ▲ / ▼ past the dial's
    // ends. Outlined in the background wherever a needle may cross it.
    const valueEl = renderer.text(
      centerValue,
      cx,
      cy + L.valueY,
      {
        "text-anchor": "middle",
        ...FONTS.title,
        "font-size": `${L.font}px`,
        fill: THEME.axis.titleColor,
        ...(needle ? { ...halo, "stroke-width": 3 } : {}),
        class: "facet-gauge-value",
      },
      g,
    );
    if (off) {
      const mark = renderer.create("tspan", { dx: 3, "font-size": `${Math.round(L.font * 0.55)}px`, fill: THEME.axis.labelColor, class: "facet-gauge-off-dial" }, valueEl);
      mark.textContent = off;
    }

    // Optional series/point name, cut with … to the gauge's width.
    if (nameText) {
      const nameY = namePosition === "top"
        ? plot.y + nameFontSize
        : namePosition === "bottom"
          ? plot.y + plot.height - nameFontSize / 2
          : cy + L.nameY;
      renderer.text(
        fitText(String(nameText), plot.width - 8, (t) => renderer.measureText(t, nameAttrs).width),
        cx,
        nameY,
        { "text-anchor": "middle", ...nameAttrs, fill: THEME.axis.labelColor, class: "facet-gauge-label" },
        g,
      );
    }
  }
}
