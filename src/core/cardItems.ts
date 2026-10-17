/**
 * Composable card content: rows of small items (text, values, changes,
 * charts, bars, rings, badges, icons, images) a host arranges freely.
 *
 * Every item is optional and styled on its own, so a card can be anything
 * from one big number to a status tile with a target ring and a trend.
 */

import type { ChartOptions } from "./options.js";
import type { resolveTheme } from "./theme.js";
import { formatValue } from "./utils.js";

type Theme = ReturnType<typeof resolveTheme>;

export type CardValue = number | string;
export type CardStyle = Record<string, string | number | undefined>;
export type CardTone = "positive" | "negative" | "warning" | "neutral" | "info";

export interface CardValueContext {
  value: CardValue;
}

export interface CardComparisonContext {
  value: CardValue;
  previousValue?: number;
  difference?: number;
  percentChange?: number;
  direction: "up" | "down" | "flat";
}

/** Where a pinned item sits, out of the rows. */
export type CardItemPin = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface CardItemBase {
  /** Written to `data-item`, so a host can find the item, e.g. to select it. */
  id?: string;
  /** Hover text. */
  tooltip?: string;
  /** Take the row's spare width. */
  grow?: boolean;
  /** Width in px, or any CSS length. */
  width?: number | string;
  /** Out of the rows, in a corner of the card. */
  pin?: CardItemPin;
  className?: string;
  style?: CardStyle;
}

/** A run of text with its own look, e.g. a value inside a sentence. */
export interface CardTextSpan {
  text: string;
  color?: string;
  size?: number | string;
  weight?: number | string;
  italic?: boolean;
}

export interface CardTextItem extends CardItemBase {
  type: "text";
  /** Plain text, or runs of it styled separately. */
  text: string | CardTextSpan[];
  /** px, or any CSS length. Default 13. */
  size?: number | string;
  weight?: number | string;
  color?: string;
  italic?: boolean;
  align?: "left" | "center" | "right";
  /** One line, ending in an ellipsis when it doesn't fit. */
  nowrap?: boolean;
}

export interface CardValueItem extends CardItemBase {
  type: "value";
  value: CardValue;
  /** FacetViz number format, e.g. `$,.1s`. */
  format?: string;
  formatter?: (context: CardValueContext) => string;
  /** px, or any CSS length (e.g. `clamp(20px, 15cqi, 40px)`). Default 32. */
  size?: number | string;
  weight?: number | string;
  color?: string;
  italic?: boolean;
  align?: "left" | "center" | "right";
}

export interface CardChangeItem extends CardItemBase {
  type: "change";
  /** Current value; the change derives from it and `previousValue`. */
  value?: number;
  previousValue?: number;
  /** Explicit absolute change, over the derived one. */
  difference?: number;
  /** Explicit ratio (0.125 = 12.5%), over the derived one. */
  percentChange?: number;
  /** Default `percent`. */
  display?: "difference" | "percent" | "both";
  /** Muted text after the change, e.g. "vs last month". */
  label?: string;
  /** Number format for the difference. */
  format?: string;
  /** Default `.1%`. */
  percentFormat?: string;
  /** Default `increase`. */
  favorableDirection?: "increase" | "decrease" | "neutral";
  /** Arrows (default), triangles, or none. */
  icon?: "arrow" | "triangle" | "none";
  /** A tinted pill behind the change. */
  pill?: boolean;
  size?: number | string;
  weight?: number | string;
  positiveColor?: string;
  negativeColor?: string;
  neutralColor?: string;
  /** One color whatever the direction, over the sentiment colors. */
  color?: string;
  formatter?: (context: CardComparisonContext) => string;
}

export interface CardChartItem extends CardItemBase {
  type: "chart";
  /** Any FacetViz chart; axes, legend and titles default off. */
  chart: ChartOptions;
  /** Default 40. */
  height?: number;
}

/** A shaded stretch behind a bar, from the previous band's end (or `min`) to `to`. */
export interface CardBand {
  to: number;
  color: string;
}

export interface CardBarItem extends CardItemBase {
  type: "bar";
  value: number;
  /** Default 0. */
  min?: number;
  max: number;
  /** A line across the bar, such as a goal. */
  target?: number;
  bands?: CardBand[];
  color?: string;
  trackColor?: string;
  targetColor?: string;
  /** Default 8. */
  height?: number;
  /** Rounded ends. Default true. */
  rounded?: boolean;
  /** For screen readers. */
  label?: string;
}

export interface CardRingItem extends CardItemBase {
  type: "ring";
  value: number;
  /** Default 0. */
  min?: number;
  max: number;
  /** px. Default 64. */
  size?: number;
  /** Stroke as a share of the ring's size, 0.04–0.4. Default 0.12. */
  thickness?: number;
  color?: string;
  trackColor?: string;
  /** Text in the middle; the share filled ("83%") by default, `""` for none. */
  label?: string;
  labelColor?: string;
  /** Rounded ends. Default true. */
  rounded?: boolean;
}

export interface CardBadgeItem extends CardItemBase {
  type: "badge";
  text: string;
  tone?: CardTone;
  color?: string;
  backgroundColor?: string;
  size?: number | string;
}

export interface CardIconItem extends CardItemBase {
  type: "icon";
  /** SVG path data. */
  path: string | string[];
  /** Default `0 0 24 24`. */
  viewBox?: string;
  /** px. Default 20. */
  size?: number;
  color?: string;
  /** Filled shapes instead of outlines. */
  fill?: boolean;
  strokeWidth?: number;
  /** A tinted circle behind the icon. */
  backgroundColor?: string;
}

export interface CardImageItem extends CardItemBase {
  type: "image";
  src: string;
  alt?: string;
  /** px. Default 40. */
  height?: number;
  fit?: "contain" | "cover";
  radius?: number;
}

export interface CardDividerItem extends CardItemBase {
  type: "divider";
  color?: string;
  /** Upright, between items in a row. */
  vertical?: boolean;
}

export interface CardSpacerItem extends CardItemBase {
  type: "spacer";
  /** px; with `grow`, the least it takes. Default 8. */
  size?: number;
}

/** Items one above another, as one item of a row (e.g. lines of text
 * beside a ring). */
export interface CardStackItem extends CardItemBase {
  type: "stack";
  items: CardItem[];
  /** px between items. Default 2. */
  gap?: number;
  /** Across the stack. Default `start`. */
  align?: "start" | "center" | "end" | "stretch";
}

export type CardItem =
  | CardStackItem
  | CardTextItem
  | CardValueItem
  | CardChangeItem
  | CardChartItem
  | CardBarItem
  | CardRingItem
  | CardBadgeItem
  | CardIconItem
  | CardImageItem
  | CardDividerItem
  | CardSpacerItem;

export interface CardRow {
  items: CardItem[];
  /** Written to `data-row`. */
  id?: string;
  /** Along the row. Default `start`. */
  justify?: "start" | "center" | "end" | "between" | "around";
  /** Across the row. Default `center`. */
  align?: "start" | "center" | "end" | "baseline" | "stretch";
  /** px between items. Default 8. */
  gap?: number;
  /** Take the card's spare height, e.g. for a chart. */
  grow?: boolean;
  /** Keep items on one line instead of wrapping. */
  nowrap?: boolean;
  style?: CardStyle;
}

export interface CardAccentOptions {
  color: string;
  /** Default `left`. */
  side?: "left" | "top" | "right" | "bottom";
  /** px. Default 4. */
  width?: number;
}

export interface ResolvedChange {
  text: string;
  label?: string;
  direction: CardComparisonContext["direction"];
  sentiment: "positive" | "negative" | "neutral";
  color: string;
}

/** What to write for a change and how it reads: up or down, good or bad. */
export function resolveChange(
  current: number | undefined,
  options: Pick<CardChangeItem, "previousValue" | "difference" | "percentChange" | "display" | "format" | "percentFormat" | "favorableDirection" | "formatter" | "positiveColor" | "negativeColor" | "neutralColor" | "label"> & { icon?: CardChangeItem["icon"] },
  theme: Theme,
  value: CardValue = current ?? "",
): ResolvedChange | undefined {
  const previous = finite(options.previousValue);
  const difference = finite(options.difference) ??
    (current !== undefined && previous !== undefined ? current - previous : undefined);
  const percentChange = finite(options.percentChange) ??
    (difference !== undefined && previous !== undefined && previous !== 0
      ? difference / Math.abs(previous)
      : undefined);
  const basis = difference ?? percentChange;
  const direction: CardComparisonContext["direction"] =
    basis === undefined || basis === 0 ? "flat" : basis > 0 ? "up" : "down";
  const context: CardComparisonContext = { value, previousValue: previous, difference, percentChange, direction };
  const display = options.display ?? "percent";
  let text = options.formatter?.(context);
  if (text === undefined) {
    const absoluteText = difference === undefined ? undefined : signedFormat(difference, options.format);
    const percentText = percentChange === undefined ? undefined : signedFormat(percentChange, options.percentFormat ?? ".1%");
    if (display === "both" && absoluteText && percentText) text = `${absoluteText} (${percentText})`;
    else if (display === "difference") text = absoluteText ?? percentText;
    else text = percentText ?? absoluteText;
  }
  if (!text) return undefined;

  const favorable = options.favorableDirection ?? "increase";
  const sentiment = direction === "flat" || favorable === "neutral"
    ? "neutral"
    : (direction === "up") === (favorable === "increase") ? "positive" : "negative";
  const color = sentiment === "positive"
    ? options.positiveColor ?? toneColor("positive", theme)
    : sentiment === "negative"
      ? options.negativeColor ?? toneColor("negative", theme)
      : options.neutralColor ?? theme.subtitle.color;
  const icons = options.icon === "triangle" ? ["▲ ", "▼ ", ""] : ["↗ ", "↘ ", "→ "];
  const icon = options.icon === "none" ? "" : direction === "up" ? icons[0] : direction === "down" ? icons[1] : icons[2];
  return { text: `${icon}${text}`, label: options.label, direction, sentiment, color };
}

/** Lays out `rows` (and pinned items) into a card body. Charts are handed
 * back unrendered: they need their host in the document to measure it. */
export function renderCardRows(
  rows: CardRow[],
  theme: Theme,
  align: "start" | "center" | "end" | "between" | undefined,
  rowGap: number | undefined,
): { element: HTMLDivElement; pinned: HTMLElement[]; charts: Array<{ host: HTMLElement; item: CardChartItem }>; text: string[] } {
  const charts: Array<{ host: HTMLElement; item: CardChartItem }> = [];
  const pinned: HTMLElement[] = [];
  const text: string[] = [];
  const stack = document.createElement("div");
  stack.className = "facet-card-rows";
  stack.style.display = "flex";
  stack.style.flexDirection = "column";
  stack.style.flex = "1 1 auto";
  stack.style.minWidth = "0";
  stack.style.gap = `${rowGap ?? 6}px`;
  stack.style.justifyContent = flexJustify(align ?? "start");

  rows.forEach((row, index) => {
    const line = document.createElement("div");
    line.className = "facet-card-row";
    line.dataset.row = row.id ?? String(index);
    line.style.display = "flex";
    line.style.flexWrap = row.nowrap ? "nowrap" : "wrap";
    line.style.alignItems = row.align === "start" ? "flex-start" : row.align === "end" ? "flex-end" : (row.align ?? "center");
    line.style.justifyContent = flexJustify(row.justify ?? "start");
    line.style.gap = `${row.gap ?? 8}px`;
    line.style.minWidth = "0";
    line.style.flex = row.grow ? "1 1 auto" : "0 0 auto";
    applyStyle(line, row.style);
    for (const item of row.items) {
      const el = renderItem(item, theme, charts, text);
      if (item.pin) {
        placePin(el, item.pin);
        pinned.push(el);
      } else line.appendChild(el);
    }
    stack.appendChild(line);
  });
  return { element: stack, pinned, charts, text };
}

function renderItem(
  item: CardItem,
  theme: Theme,
  charts: Array<{ host: HTMLElement; item: CardChartItem }>,
  text: string[],
): HTMLElement {
  const el = document.createElement("div");
  el.className = ["facet-card-item", `facet-card-item-${item.type}`, item.className].filter(Boolean).join(" ");
  if (item.id !== undefined) el.dataset.item = item.id;
  if (item.tooltip) el.title = item.tooltip;
  el.style.minWidth = "0";
  el.style.boxSizing = "border-box";
  const fills = item.type === "chart" || item.type === "bar" || (item.type === "divider" && !item.vertical);
  el.style.flex = item.grow ? "1 1 0" : fills ? "1 1 100%" : "0 1 auto";
  if (item.width !== undefined) {
    el.style.flex = "0 0 auto";
    el.style.width = typeof item.width === "number" ? `${item.width}px` : item.width;
  }

  switch (item.type) {
    case "stack": {
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.gap = `${item.gap ?? 2}px`;
      el.style.alignItems = item.align === "center" ? "center" : item.align === "end" ? "flex-end" : item.align === "stretch" ? "stretch" : "flex-start";
      for (const child of item.items) {
        const c = renderItem(child, theme, charts, text);
        // Down a stack, items size to their content, and charts and bars span it.
        c.style.flex = "0 0 auto";
        if (child.type === "chart" || child.type === "bar" || child.type === "divider") c.style.alignSelf = "stretch";
        el.appendChild(c);
      }
      break;
    }
    case "text": {
      el.style.fontSize = cssSize(item.size, 13);
      el.style.lineHeight = "1.35";
      el.style.color = item.color ?? theme.title.color;
      if (item.weight !== undefined) el.style.fontWeight = String(item.weight);
      if (item.italic) el.style.fontStyle = "italic";
      if (item.align) el.style.textAlign = item.align;
      if (item.nowrap) {
        el.style.whiteSpace = "nowrap";
        el.style.overflow = "hidden";
        el.style.textOverflow = "ellipsis";
      } else el.style.overflowWrap = "anywhere";
      const spans = typeof item.text === "string" ? [{ text: item.text }] : item.text;
      for (const s of spans) {
        if (!s.color && s.size === undefined && s.weight === undefined && !s.italic) {
          el.appendChild(document.createTextNode(s.text));
          continue;
        }
        const span = document.createElement("span");
        span.textContent = s.text;
        if (s.color) span.style.color = s.color;
        if (s.size !== undefined) span.style.fontSize = cssSize(s.size, 13);
        if (s.weight !== undefined) span.style.fontWeight = String(s.weight);
        if (s.italic) span.style.fontStyle = "italic";
        el.appendChild(span);
      }
      text.push(el.textContent ?? "");
      break;
    }
    case "value": {
      const written = item.formatter
        ? String(item.formatter({ value: item.value }))
        : formatCardValue(item.value, item.format);
      el.textContent = written;
      el.style.fontSize = cssSize(item.size, 32);
      el.style.fontWeight = String(item.weight ?? 700);
      el.style.lineHeight = "1.1";
      el.style.letterSpacing = "-0.02em";
      el.style.color = item.color ?? theme.title.color;
      el.style.fontVariantNumeric = "tabular-nums";
      el.style.whiteSpace = "nowrap";
      el.style.overflow = "hidden";
      el.style.textOverflow = "ellipsis";
      if (item.italic) el.style.fontStyle = "italic";
      if (item.align) el.style.textAlign = item.align;
      text.push(written);
      break;
    }
    case "change": {
      const change = resolveChange(item.value, item, theme);
      if (!change) {
        el.style.display = "none";
        break;
      }
      const color = item.color ?? change.color;
      el.classList.add(`facet-card-item-change-${change.sentiment}`);
      el.dataset.direction = change.direction;
      el.style.display = "inline-flex";
      el.style.flexWrap = "wrap";
      el.style.alignItems = "baseline";
      el.style.gap = "5px";
      el.style.fontSize = cssSize(item.size, 12);
      el.style.lineHeight = "1.35";
      const analysis = document.createElement("span");
      analysis.className = "facet-card-item-change-value";
      analysis.textContent = change.text;
      analysis.style.color = color;
      analysis.style.fontWeight = String(item.weight ?? 600);
      analysis.style.whiteSpace = "nowrap";
      if (item.pill) {
        analysis.style.padding = "1px 8px";
        analysis.style.borderRadius = "999px";
        analysis.style.background = colorMix(color, "transparent", 14);
      }
      el.appendChild(analysis);
      if (change.label) {
        const label = document.createElement("span");
        label.className = "facet-card-item-change-label";
        label.textContent = change.label;
        label.style.color = theme.subtitle.color;
        el.appendChild(label);
      }
      text.push([change.text, change.label].filter(Boolean).join(" "));
      break;
    }
    case "chart": {
      el.style.height = `${item.chart.chart?.height ?? item.height ?? 40}px`;
      el.style.alignSelf = "stretch";
      charts.push({ host: el, item });
      break;
    }
    case "bar": {
      const min = item.min ?? 0;
      const span = item.max - min;
      const at = (v: number) => (span > 0 ? clamp01((v - min) / span) * 100 : 0);
      const height = item.height ?? 8;
      const rounded = item.rounded !== false;
      el.style.position = "relative";
      el.style.alignSelf = "center";
      el.style.height = `${height}px`;
      el.setAttribute("role", "meter");
      el.setAttribute("aria-valuemin", String(min));
      el.setAttribute("aria-valuemax", String(item.max));
      el.setAttribute("aria-valuenow", String(item.value));
      if (item.label) el.setAttribute("aria-label", item.label);
      const track = document.createElement("div");
      track.className = "facet-card-item-bar-track";
      track.style.position = "absolute";
      track.style.inset = "0";
      track.style.overflow = "hidden";
      track.style.borderRadius = rounded ? "999px" : "0";
      track.style.background = item.trackColor ?? theme.axis.gridLineColor;
      let from = 0;
      for (const band of item.bands ?? []) {
        const to = at(band.to);
        if (to <= from) continue;
        const shade = document.createElement("div");
        shade.className = "facet-card-item-bar-band";
        shade.style.position = "absolute";
        shade.style.top = "0";
        shade.style.bottom = "0";
        shade.style.left = `${from}%`;
        shade.style.width = `${to - from}%`;
        shade.style.background = band.color;
        track.appendChild(shade);
        from = to;
      }
      const fill = document.createElement("div");
      fill.className = "facet-card-item-bar-value";
      fill.style.position = "absolute";
      fill.style.left = "0";
      // Over bands, the value is a narrower bar down the middle.
      fill.style.top = item.bands?.length ? "30%" : "0";
      fill.style.bottom = item.bands?.length ? "30%" : "0";
      fill.style.width = `${at(item.value)}%`;
      fill.style.borderRadius = rounded ? "999px" : "0";
      fill.style.background = item.color ?? theme.colors[0];
      track.appendChild(fill);
      el.appendChild(track);
      if (finite(item.target) !== undefined) {
        const mark = document.createElement("div");
        mark.className = "facet-card-item-bar-target";
        mark.style.position = "absolute";
        mark.style.top = "-3px";
        mark.style.bottom = "-3px";
        mark.style.width = "2px";
        mark.style.left = `calc(${at(item.target!)}% - 1px)`;
        mark.style.background = item.targetColor ?? theme.title.color;
        el.appendChild(mark);
      }
      break;
    }
    case "ring": {
      const min = item.min ?? 0;
      const span = item.max - min;
      const ratio = span > 0 ? clamp01((item.value - min) / span) : 0;
      const size = item.size ?? 64;
      const thickness = Math.max(0.04, Math.min(0.4, item.thickness ?? 0.12)) * 100;
      const r = 50 - thickness / 2;
      const circumference = 2 * Math.PI * r;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("role", "img");
      const label = item.label ?? formatValue(ratio, ".0%");
      svg.setAttribute("aria-label", label || formatValue(ratio, ".0%"));
      svg.style.display = "block";
      const track = document.createElementNS(ns, "circle");
      const arc = document.createElementNS(ns, "circle");
      for (const c of [track, arc]) {
        c.setAttribute("cx", "50");
        c.setAttribute("cy", "50");
        c.setAttribute("r", String(r));
        c.setAttribute("fill", "none");
        c.setAttribute("stroke-width", String(thickness));
      }
      track.setAttribute("stroke", item.trackColor ?? theme.axis.gridLineColor);
      arc.setAttribute("stroke", item.color ?? theme.colors[0]);
      if (item.rounded !== false && ratio > 0) arc.setAttribute("stroke-linecap", "round");
      arc.setAttribute("stroke-dasharray", String(circumference));
      arc.setAttribute("stroke-dashoffset", String(circumference * (1 - ratio)));
      arc.setAttribute("transform", "rotate(-90 50 50)");
      svg.append(track, arc);
      if (label) {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", "50");
        t.setAttribute("y", "50");
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "central");
        t.setAttribute("fill", item.labelColor ?? theme.title.color);
        // Shrinks for longer labels so they stay inside the ring.
        t.setAttribute("font-size", String(Math.min(24, (2 * r - thickness) / Math.max(3, label.length) * 1.7)));
        t.setAttribute("font-weight", "600");
        t.textContent = label;
        svg.appendChild(t);
      }
      el.appendChild(svg);
      text.push(label);
      break;
    }
    case "badge": {
      const color = item.color ?? toneColor(item.tone ?? "neutral", theme);
      el.textContent = item.text;
      el.style.display = "inline-block";
      el.style.padding = "2px 9px";
      el.style.borderRadius = "999px";
      el.style.fontSize = cssSize(item.size, 11);
      el.style.fontWeight = "600";
      el.style.lineHeight = "1.5";
      el.style.whiteSpace = "nowrap";
      el.style.color = color;
      el.style.background = item.backgroundColor ?? colorMix(color, "transparent", 14);
      text.push(item.text);
      break;
    }
    case "icon": {
      const size = item.size ?? 20;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", item.viewBox ?? "0 0 24 24");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("fill", item.fill ? "currentColor" : "none");
      svg.setAttribute("stroke", item.fill ? "none" : "currentColor");
      svg.setAttribute("stroke-width", String(item.strokeWidth ?? 1.75));
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.style.display = "block";
      for (const d of Array.isArray(item.path) ? item.path : [item.path]) {
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", d);
        svg.appendChild(p);
      }
      el.style.color = item.color ?? theme.subtitle.color;
      el.style.display = "inline-flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      if (item.backgroundColor) {
        el.style.width = `${Math.round(size * 1.9)}px`;
        el.style.height = `${Math.round(size * 1.9)}px`;
        el.style.borderRadius = "999px";
        el.style.background = item.backgroundColor;
        el.style.flex = "0 0 auto";
      }
      el.appendChild(svg);
      break;
    }
    case "image": {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.alt ?? "";
      img.style.display = "block";
      img.style.height = `${item.height ?? 40}px`;
      img.style.maxWidth = "100%";
      img.style.objectFit = item.fit ?? "contain";
      if (item.radius) img.style.borderRadius = `${item.radius}px`;
      if (item.width !== undefined) img.style.width = "100%";
      el.appendChild(img);
      break;
    }
    case "divider": {
      const color = item.color ?? theme.axis.lineColor;
      if (item.vertical) {
        el.style.width = "1px";
        el.style.alignSelf = "stretch";
        el.style.minHeight = "16px";
      } else el.style.height = "1px";
      el.style.background = color;
      el.setAttribute("role", "separator");
      break;
    }
    case "spacer": {
      const size = `${item.size ?? 8}px`;
      el.style.minWidth = size;
      el.style.minHeight = size;
      if (!item.grow) el.style.flex = `0 0 ${size}`;
      break;
    }
  }
  applyStyle(el, item.style);
  return el;
}

function placePin(el: HTMLElement, pin: CardItemPin): void {
  el.style.position = "absolute";
  el.style.flex = "none";
  const [v, h] = pin.split("-");
  el.style[v as "top" | "bottom"] = "12px";
  el.style[h as "left" | "right"] = "12px";
  el.style.zIndex = "1";
}

function flexJustify(j: "start" | "center" | "end" | "between" | "around"): string {
  return j === "between" ? "space-between" : j === "around" ? "space-around" : j === "start" ? "flex-start" : j === "end" ? "flex-end" : "center";
}

function cssSize(size: number | string | undefined, fallback: number): string {
  if (size === undefined) return `${fallback}px`;
  return typeof size === "number" ? `${size}px` : size;
}

export function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function formatCardValue(value: CardValue | undefined, format?: string): string {
  if (value === undefined) return "";
  if (typeof value !== "number") return String(value);
  if (!Number.isFinite(value)) return "—";
  return format ? formatValue(value, format) : String(value);
}

export function toneColor(tone: CardTone, theme: Theme): string {
  const dark = theme.name === "dark";
  if (tone === "positive") return dark ? "#4ade80" : "#15803d";
  if (tone === "negative") return dark ? "#f87171" : "#b91c1c";
  if (tone === "warning") return dark ? "#fbbf24" : "#b45309";
  if (tone === "info") return theme.colors[0];
  return theme.subtitle.color;
}

export function colorMix(foreground: string, background: string, percent: number): string {
  return `color-mix(in srgb, ${foreground} ${percent}%, ${background})`;
}

export function signedFormat(value: number, format?: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const magnitude = Math.abs(value);
  return `${sign}${format ? formatValue(magnitude, format) : String(magnitude)}`;
}

const UNITLESS_STYLES = new Set([
  "flex", "flexGrow", "flexShrink", "fontWeight", "lineHeight", "opacity",
  "order", "zIndex", "zoom",
]);

export function applyStyle(element: HTMLElement, style: CardStyle | undefined): void {
  if (!style) return;
  for (const [property, rawValue] of Object.entries(style)) {
    if (rawValue === undefined) continue;
    const customProperty = property.startsWith("--");
    const value = typeof rawValue === "number" && !customProperty &&
      !UNITLESS_STYLES.has(property) ? `${rawValue}px` : String(rawValue);
    if (customProperty || property.includes("-")) element.style.setProperty(property, value);
    else (element.style as unknown as Record<string, string>)[property] = value;
  }
}
