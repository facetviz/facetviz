// src/core/point.ts
function normalizePoints(data, categories) {
  return data.map((raw, index) => normalizePoint(raw, index, categories));
}
function normalizePoint(raw, index, categories) {
  let catX = categories?.[index] ?? index;
  if (raw === null)
    return { x: catX, index, options: {} };
  if (typeof raw == "number")
    return { x: catX, index, y: raw, options: { y: raw } };
  if (Array.isArray(raw)) {
    let [x, a, b] = raw;
    return b !== void 0 ? {
      x,
      index,
      low: a,
      high: b,
      options: { x, low: a, high: b }
    } : { x, index, y: a, options: { x, y: a } };
  }
  let opts = raw, nameOrCat = opts.name !== void 0 && opts.name !== "" ? opts.name : catX, point = {
    x: opts.x ?? nameOrCat,
    index,
    y: opts.y,
    low: opts.low,
    high: opts.high,
    name: opts.name,
    color: opts.color,
    options: opts
  };
  return opts.min !== void 0 && opts.q1 !== void 0 && opts.median !== void 0 && opts.q3 !== void 0 && opts.max !== void 0 && (point.box = {
    min: opts.min,
    q1: opts.q1,
    median: opts.median,
    q3: opts.q3,
    max: opts.max,
    outliers: opts.outliers?.length ? opts.outliers : void 0
  }), point;
}

// src/series/base.ts
var BaseSeries = class {
  constructor(options, categories) {
    /** Assigned by the chart. */
    this.index = 0;
    this.color = "#000";
    /**
     * Point indices hidden via the legend (used by point-legend charts such as
     * pie / donut / radial bar). Rendering skips these points.
     */
    this.hiddenPoints = /* @__PURE__ */ new Set();
    this.options = options, this.type = options.type ?? "line", this.name = options.name ?? "Series", this.visible = options.visible !== !1, this.points = normalizePoints(options.data, categories);
  }
  /** Points that should actually be drawn (respects per-point hiding). */
  visiblePoints() {
    return this.hiddenPoints.size === 0 ? this.points : this.points.filter((p) => !this.hiddenPoints.has(p.index));
  }
  /**
   * The [min, max] value range this series contributes to the value axis,
   * given whether it is stacked (stack totals are precomputed on points).
   */
  valueExtent() {
    let min = 1 / 0, max = -1 / 0;
    for (let p of this.points)
      for (let v of this.pointValues(p))
        v !== void 0 && (v < min && (min = v), v > max && (max = v));
    return min === 1 / 0 ? [0, 1] : [min, max];
  }
  /** Values a point contributes to the value axis. Overridden by range/box. */
  pointValues(p) {
    return p.stackHigh !== void 0 ? [p.stackLow, p.stackHigh] : [p.y];
  }
  /**
   * Return a shallow clone of this series containing only the points whose
   * option fields match every entry in `filters` (ignoring empty keys / values).
   * Used by the trellis engine to split a series across small-multiple panels.
   */
  filterByDimensions(filters) {
    let active = Object.entries(filters).filter(
      ([k, v]) => k !== "" && v !== void 0
    );
    if (!active.length) return this;
    let clone = Object.create(Object.getPrototypeOf(this));
    return Object.assign(clone, this), clone.points = this.points.filter(
      (p) => active.every(([k, v]) => String(p.options[k]) === String(v))
    ), clone;
  }
  /** Return a shallow clone of this series with a replaced point set. */
  withPoints(points) {
    let clone = Object.create(Object.getPrototypeOf(this));
    return Object.assign(clone, this), clone.points = points, clone;
  }
  /**
   * Return a shallow clone of this series with `patch` merged into its
   * options — used to temporarily suppress data labels on a shrunk container
   * without mutating the caller's original config.
   */
  withOptions(patch) {
    let clone = Object.create(Object.getPrototypeOf(this));
    return Object.assign(clone, this, { options: { ...this.options, ...patch } }), clone;
  }
  /** Build the event payload for a point. */
  event(kind, p, dom) {
    return {
      type: kind,
      seriesName: this.name,
      seriesIndex: this.index,
      pointIndex: p.index,
      x: p.x,
      y: p.y,
      point: p.options,
      domEvent: dom
    };
  }
};

// src/series/paths.ts
function linePath(pts) {
  return pts.length ? pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") : "";
}
function splinePath(pts, tension = 0.5) {
  if (pts.length < 3) return linePath(pts);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    let p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2, cp1x = p1.x + (p2.x - p0.x) / 6 * tension * 2, cp1y = p1.y + (p2.y - p0.y) / 6 * tension * 2, cp2x = p2.x - (p3.x - p1.x) / 6 * tension * 2, cp2y = p2.y - (p3.y - p1.y) / 6 * tension * 2;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
function stepPath(pts) {
  if (!pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    let midX = (pts[i - 1].x + pts[i].x) / 2;
    d += ` L ${midX} ${pts[i - 1].y} L ${midX} ${pts[i].y} L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

// src/core/defaults.ts
var DEFAULT_OPTIONS = {
  chart: {
    type: "line",
    spacing: [16, 16, 16, 16],
    inverted: !1,
    polar: !1
    // `backgroundColor`, `colors`, `width`, and `height` are intentionally
    // left unset so the theme (and the container's actual size) can supply
    // them — the constructor falls back to clientWidth/clientHeight, then a
    // hardcoded 640×400, only once it sees these are genuinely unset.
    // Explicit user values still win via the normal merge.
  },
  title: { text: void 0, align: "center" },
  subtitle: { text: void 0, align: "center" },
  tooltip: {
    enabled: !0,
    shared: !1
    // Colours come from the theme unless the user overrides them.
  },
  legend: {
    enabled: !0,
    align: "center",
    verticalAlign: "bottom"
  }
}, LAYOUT = {
  titleHeight: 30,
  subtitleHeight: 20,
  legendHeight: 34,
  axisLabelGap: 8,
  /** Gap between tick labels and the axis title, for horizontal (x) axes. */
  axisTitleGap: 22,
  tickLength: 5,
  defaultLeftAxisWidth: 44,
  defaultBottomAxisHeight: 34
}, FONTS = {
  title: { "font-size": "18px", "font-weight": "600", fill: "#333333" },
  subtitle: { "font-size": "13px", fill: "#666666" },
  axisLabel: { "font-size": "11px", fill: "#666666" },
  axisTitle: { "font-size": "12px", fill: "#444444" },
  legend: { "font-size": "12px", fill: "#333333" },
  dataLabel: { "font-size": "11px", fill: "#333333" }
};

// src/core/colors.ts
var DEFAULT_COLORS = [
  "#2caffe",
  "#544fc5",
  "#00e272",
  "#fe6a35",
  "#6b8abc",
  "#d568fb",
  "#2ee0ca",
  "#fa4b42",
  "#feb56a",
  "#91e8e1"
];
function paletteColor(colors, index) {
  return colors[index % colors.length];
}
function parseHex(hex) {
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  h.length === 3 && (h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]);
  let n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function shade(hex, amount) {
  let rgb = parseHex(hex);
  if (!rgb) return hex;
  let adjust = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount), [r, g, b] = rgb.map(adjust);
  return `rgb(${r}, ${g}, ${b})`;
}
function alpha(hex, a) {
  let rgb = parseHex(hex);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : hex;
}
function lerpColor(from, to, t) {
  let a = parseHex(from), b = parseHex(to);
  if (!a || !b) return from;
  let k = Math.max(0, Math.min(1, t)), c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// src/core/font-scale-state.ts
var FONT_SCALE_STATE = { scale: 1, scaleExplicit: !1 };

// src/core/utils.ts
function isObject(v) {
  return typeof v == "object" && v !== null && !Array.isArray(v);
}
function merge(target, ...sources) {
  let out = Array.isArray(target) ? [...target] : { ...target };
  for (let source of sources)
    if (source)
      for (let key of Object.keys(source)) {
        let sv = source[key], tv = out[key];
        isObject(sv) && isObject(tv) ? out[key] = merge(tv, sv) : sv !== void 0 && (out[key] = sv);
      }
  return out;
}
function sum(values) {
  let total = 0;
  for (let v of values) typeof v == "number" && !Number.isNaN(v) && (total += v);
  return total;
}
function extent(values) {
  let min = 1 / 0, max = -1 / 0;
  for (let v of values)
    v < min && (min = v), v > max && (max = v);
  return min === 1 / 0 ? [0, 1] : [min, max];
}
function decimateLine(pts, targetPerColumn = 1) {
  if (pts.length < 400) return pts;
  let out = [], colX = Math.round(pts[0].x / targetPerColumn), first = null, last = null, min = null, max = null, flush = () => {
    if (!first) return;
    let chosen = [first, min, max, last].filter((p, i, a) => a.indexOf(p) === i).sort((a, b) => a.x - b.x);
    out.push(...chosen);
  };
  for (let p of pts) {
    let cx = Math.round(p.x / targetPerColumn);
    cx !== colX && (flush(), colX = cx, first = min = max = last = null), first || (first = p), (!min || p.y < min.y) && (min = p), (!max || p.y > max.y) && (max = p), last = p;
  }
  return flush(), out;
}
function seededRandom(seed) {
  let s = seed % 2147483647;
  return s <= 0 && (s += 2147483646), () => (s = s * 16807 % 2147483647, (s - 1) / 2147483646);
}
function formatString(template, ctx) {
  return template.replace(/\{([^{}:]+)(?::([^{}]*))?\}/g, (_, path, spec) => {
    let value = resolvePath(ctx, path.trim());
    if (value == null) return "";
    if (spec !== void 0 && spec !== "") {
      if (/%[a-zA-Z]/.test(spec)) return formatDate(value, spec);
      if (typeof value == "number") return formatValue(value, spec);
    }
    return String(value);
  });
}
function escapeHTML(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatHTMLString(template, ctx) {
  return template.replace(/\{([^{}:]+)(?::([^{}]*))?\}/g, (_, path, spec) => {
    let value = resolvePath(ctx, path.trim());
    if (value == null) return "";
    let formatted = value;
    return spec !== void 0 && spec !== "" && (/%[a-zA-Z]/.test(spec) ? formatted = formatDate(value, spec) : typeof value == "number" && (formatted = formatValue(value, spec))), escapeHTML(formatted);
  });
}
function resolvePath(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc == "object") return acc[key];
  }, obj);
}
function groupThousands(numStr, sep = ",") {
  let neg = numStr.startsWith("-"), body = neg ? numStr.slice(1) : numStr, [int, frac] = body.split("."), grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? "-" : "") + grouped + (frac !== void 0 ? "." + frac : "");
}
function abbreviateNumber(value, decimals = 1) {
  let units = [
    { v: 1e12, s: "T" },
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "k" }
  ], abs = Math.abs(value);
  for (let u of units)
    if (abs >= u.v) return (value / u.v).toFixed(decimals).replace(/\.0+$/, "") + u.s;
  return trimZeros(value.toFixed(decimals));
}
function trimZeros(s) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
function formatValue(value, spec) {
  if (typeof value != "number" || Number.isNaN(value)) return "";
  let m = /^([^,.\d%sfed]*)(,)?(?:\.(\d+))?([sfed%])?(.*)$/.exec(spec);
  if (!m) return String(value);
  let [, prefix = "", comma, decStr, type, suffix = ""] = m, decimals = decStr !== void 0 ? parseInt(decStr, 10) : void 0, out, unit = "";
  switch (type) {
    case "%":
      out = (value * 100).toFixed(decimals ?? 0), unit = "%";
      break;
    case "s":
      out = abbreviateNumber(value, decimals ?? 1);
      break;
    case "e":
      return `${prefix}${value.toExponential(decimals ?? 2)}${suffix}`;
    case "d":
      out = Math.round(value).toString();
      break;
    default:
      out = decimals !== void 0 ? value.toFixed(decimals) : String(value);
  }
  return comma && type !== "s" && (out = groupThousands(out)), `${prefix}${out}${unit}${suffix}`;
}
function formatNumber(value, opts = {}) {
  if (value == null || Number.isNaN(value)) return "";
  let n = opts.decimals !== void 0 ? value.toFixed(opts.decimals) : String(value);
  return opts.thousands && (n = groupThousands(n)), `${opts.prefix ?? ""}${n}${opts.suffix ?? ""}`;
}
var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatDate(value, pattern) {
  let d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  let p2 = (n) => String(n).padStart(2, "0"), map = {
    Y: String(d.getFullYear()),
    y: p2(d.getFullYear() % 100),
    m: p2(d.getMonth() + 1),
    b: MONTHS[d.getMonth()].slice(0, 3),
    B: MONTHS[d.getMonth()],
    d: p2(d.getDate()),
    e: String(d.getDate()),
    H: p2(d.getHours()),
    M: p2(d.getMinutes()),
    S: p2(d.getSeconds()),
    a: DAYS[d.getDay()].slice(0, 3),
    A: DAYS[d.getDay()]
  };
  return pattern.replace(/%([A-Za-z])/g, (_, t) => map[t] ?? `%${t}`);
}
function niceDateTicks(min, max, count = 6) {
  let span = max - min || 1, SEC = 1e3, MIN = 60 * SEC, HOUR = 60 * MIN, DAY2 = 24 * HOUR, YEAR = 365 * DAY2, step, format, floor, next;
  if (span > 2 * YEAR) {
    format = "%Y", floor = (t) => new Date(new Date(t).getFullYear(), 0, 1).getTime();
    let yStep = Math.max(1, Math.ceil(span / YEAR / count));
    next = (t) => {
      let d = new Date(t);
      return new Date(d.getFullYear() + yStep, 0, 1).getTime();
    }, step = 0;
  } else if (span > 60 * DAY2) {
    format = "%b %Y", floor = (t) => {
      let d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    };
    let mStep = Math.max(1, Math.ceil(span / (30 * DAY2) / count));
    next = (t) => {
      let d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth() + mStep, 1).getTime();
    }, step = 0;
  } else span > 2 * DAY2 ? (format = "%b %d", step = niceUnit(span / count, [DAY2, 2 * DAY2, 7 * DAY2, 14 * DAY2]), floor = (t) => Math.floor(t / DAY2) * DAY2, next = (t) => t + step) : span > 2 * HOUR ? (format = "%H:%M", step = niceUnit(span / count, [HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR]), floor = (t) => Math.floor(t / HOUR) * HOUR, next = (t) => t + step) : (format = "%H:%M", step = niceUnit(span / count, [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN]), floor = (t) => Math.floor(t / MIN) * MIN, next = (t) => t + step);
  let ticks = [];
  for (let t = floor(min); t <= max && ticks.length < 100; t = next(t))
    t >= min && ticks.push(t);
  return ticks.length || ticks.push(min, max), { ticks, format };
}
function niceUnit(target, choices) {
  return choices.find((c) => c >= target) ?? choices[choices.length - 1];
}
function niceTicks(min, max, count = 4) {
  if (min === max) {
    let pad = Math.abs(min) || 1;
    min -= pad, max += pad;
  }
  let step = niceNum((max - min) / Math.max(1, count - 1), !0), niceMin = Math.floor(min / step) * step, niceMax = Math.ceil(max / step) * step, ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step)
    ticks.push(Number(v.toFixed(10)));
  return ticks;
}
function niceNum(range, round) {
  let exponent = Math.floor(Math.log10(range || 1)), fraction = range / Math.pow(10, exponent), niceFraction;
  return round ? niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10 : niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10, niceFraction * Math.pow(10, exponent);
}
function clampFontSize(value) {
  let n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  let unit = /[a-z%]+$/i.exec(value)?.[0] ?? "px", clamped = Math.min(Math.max(n, 6), 72);
  return clamped === n ? value : `${clamped}${unit}`;
}
function scaleFontSizeValue(value) {
  if (!FONT_SCALE_STATE.scaleExplicit || FONT_SCALE_STATE.scale === 1) return value;
  let n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  let unit = /[a-z%]+$/i.exec(value)?.[0] ?? "px";
  return `${n * FONT_SCALE_STATE.scale}${unit}`;
}
function sanitizeStyle(style) {
  if (!style) return {};
  let normalized = { ...style }, aliases = {
    fontSize: "font-size",
    fontWeight: "font-weight",
    fontFamily: "font-family",
    fontStyle: "font-style",
    letterSpacing: "letter-spacing",
    textDecoration: "text-decoration",
    color: "fill"
  };
  for (let [cssName, svgName] of Object.entries(aliases))
    normalized[cssName] !== void 0 && normalized[svgName] === void 0 && (normalized[svgName] = normalized[cssName]), delete normalized[cssName];
  let rawFontSize = normalized["font-size"];
  if (rawFontSize === void 0) return normalized;
  let clamped = clampFontSize(scaleFontSizeValue(rawFontSize));
  return clamped === rawFontSize ? normalized : { ...normalized, "font-size": clamped };
}

// src/core/theme.ts
var FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', LIGHT_THEME = {
  name: "light",
  colors: DEFAULT_COLORS,
  backgroundColor: "#ffffff",
  fontFamily: FONT_STACK,
  title: { color: "#333333", fontSize: "18px", fontWeight: "600" },
  subtitle: { color: "#666666", fontSize: "13px" },
  axis: { labelColor: "#666666", titleColor: "#444444", lineColor: "#ccd6eb", gridLineColor: "#e6e6e6" },
  dataLabel: { color: "#333333" },
  legend: { color: "#333333", hiddenColor: "#999999" },
  tooltip: { backgroundColor: "rgba(255,255,255,0.96)", borderColor: "#cccccc", color: "#333333" },
  neutralColor: "#b0b0b0"
}, DARK_THEME = {
  name: "dark",
  colors: ["#2caffe", "#00e272", "#fe6a35", "#d568fb", "#feb56a", "#2ee0ca", "#8a7bff", "#fa4b6b", "#91e8e1", "#a6c1ff"],
  backgroundColor: "#1e1e2e",
  fontFamily: FONT_STACK,
  title: { color: "#f5f5fa", fontSize: "18px", fontWeight: "600" },
  subtitle: { color: "#a6a6bd", fontSize: "13px" },
  axis: { labelColor: "#a6a6bd", titleColor: "#c8c8dc", lineColor: "#40405a", gridLineColor: "#2c2c40" },
  dataLabel: { color: "#e8e8f2" },
  legend: { color: "#d5d5e5", hiddenColor: "#5a5a70" },
  tooltip: { backgroundColor: "rgba(38,38,54,0.96)", borderColor: "#4a4a64", color: "#f0f0f8" },
  neutralColor: "#5a5a72"
}, HIGH_CONTRAST_THEME = {
  name: "high-contrast",
  colors: ["#0050ef", "#e3170a", "#00a300", "#a700d8", "#ff8c00", "#008a8a", "#c8006e", "#5a3d00"],
  backgroundColor: "#ffffff",
  fontFamily: FONT_STACK,
  title: { color: "#000000", fontSize: "18px", fontWeight: "700" },
  subtitle: { color: "#222222", fontSize: "13px" },
  axis: { labelColor: "#000000", titleColor: "#000000", lineColor: "#000000", gridLineColor: "#bbbbbb" },
  dataLabel: { color: "#000000" },
  legend: { color: "#000000", hiddenColor: "#888888" },
  tooltip: { backgroundColor: "#ffffff", borderColor: "#000000", color: "#000000" },
  neutralColor: "#555555"
}, PASTEL_THEME = {
  name: "pastel",
  colors: ["#8ecae6", "#ffb5a7", "#b7e4c7", "#ffd6a5", "#cdb4db", "#a2d2ff", "#fde4cf", "#bde0fe"],
  backgroundColor: "#fbfbfd",
  fontFamily: FONT_STACK,
  title: { color: "#4a4a5a", fontSize: "18px", fontWeight: "600" },
  subtitle: { color: "#8a8a9a", fontSize: "13px" },
  axis: { labelColor: "#8a8a9a", titleColor: "#6a6a7a", lineColor: "#dfe3ec", gridLineColor: "#eef0f5" },
  dataLabel: { color: "#5a5a6a" },
  legend: { color: "#5a5a6a", hiddenColor: "#b5b5c5" },
  tooltip: { backgroundColor: "rgba(255,255,255,0.96)", borderColor: "#dfe3ec", color: "#4a4a5a" },
  neutralColor: "#c7ccd6"
}, THEMES = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  "high-contrast": HIGH_CONTRAST_THEME,
  pastel: PASTEL_THEME
};
function registerTheme(name, theme) {
  THEMES[name] = { ...theme, name };
}
function resolveTheme(input) {
  if (!input) return LIGHT_THEME;
  if (typeof input == "string") return THEMES[input] ?? LIGHT_THEME;
  let base = THEMES[input.base ?? "light"] ?? LIGHT_THEME;
  return merge(base, input);
}
var THEME = { ...LIGHT_THEME }, FONT_SCALE_REFERENCE_PX = Math.sqrt(640 * 400), FONT_SCALE_MIN = 0.7, FONT_SCALE_MAX = 1.6;
function sizeRatio(width, height) {
  let area = Math.max(0, width) * Math.max(0, height);
  return Math.sqrt(area) / FONT_SCALE_REFERENCE_PX;
}
function chartFontScale(width, height) {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, sizeRatio(width, height)));
}
var TEXT_SCALE_MIN = 0.3;
function chartTextScale(width, height) {
  return Math.min(FONT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, sizeRatio(width, height)));
}
function scaledFontPx(px) {
  return `${px * FONT_SCALE_STATE.scale}px`;
}
function applyTheme(theme, fontScale = 1, scaleExplicit = !1) {
  Object.assign(THEME, theme), FONT_SCALE_STATE.scale = fontScale, FONT_SCALE_STATE.scaleExplicit = scaleExplicit;
  let ff = theme.fontFamily, scalePx = (px) => `${(parseFloat(px) || 0) * fontScale}px`;
  FONTS.title = { "font-size": scalePx(theme.title.fontSize), "font-weight": theme.title.fontWeight, fill: theme.title.color, "font-family": ff }, FONTS.subtitle = { "font-size": scalePx(theme.subtitle.fontSize), fill: theme.subtitle.color, "font-family": ff }, FONTS.axisLabel = { "font-size": scalePx("11px"), fill: theme.axis.labelColor, "font-family": ff }, FONTS.axisTitle = { "font-size": scalePx("12px"), fill: theme.axis.titleColor, "font-family": ff }, FONTS.legend = { "font-size": scalePx("12px"), fill: theme.legend.color, "font-family": ff }, FONTS.dataLabel = { "font-size": scalePx("11px"), fill: theme.dataLabel.color, "font-family": ff };
}

// src/series/marker.ts
function drawMarker(renderer, parent, cx, cy, spec) {
  let { symbol, fill, stroke, strokeWidth } = spec, scale = FONT_SCALE_STATE.scale, r = spec.radius * scale, common = {
    fill,
    stroke,
    "stroke-width": strokeWidth,
    class: "facet-point"
  };
  switch (symbol) {
    case "square":
      return renderer.create(
        "rect",
        { x: cx - r, y: cy - r, width: r * 2, height: r * 2, ...common },
        parent
      );
    case "diamond":
      return renderer.create(
        "polygon",
        {
          points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`,
          ...common
        },
        parent
      );
    case "triangle":
      return renderer.create(
        "polygon",
        {
          points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`,
          ...common
        },
        parent
      );
    case "rectangle": {
      let w = (spec.width ?? spec.radius * 2) * scale, h = (spec.height ?? spec.radius * 2) * scale;
      return renderer.create(
        "rect",
        { x: cx - w / 2, y: cy - h / 2, width: w, height: h, ...common },
        parent
      );
    }
    default:
      return renderer.create("circle", { cx, cy, r, ...common }, parent);
  }
}

// src/series/data-label.ts
function labelString(dl, ctx) {
  if (dl.formatter) return dl.formatter(ctx);
  let data = {
    ...ctx,
    y: ctx.y ?? "",
    name: ctx.name ?? ctx.point?.name ?? ctx.x
  };
  return formatString(dl.format ?? "{y}", data);
}
function dataLabelFontSize(dl) {
  return dl?.fontSize ? sanitizeStyle({ "font-size": dl.fontSize })["font-size"] : FONTS.dataLabel["font-size"];
}
function drawDataLabel(renderer, parent, text, place, dl) {
  if (!text) return;
  let anchor = dl.align === "left" ? "start" : dl.align === "right" ? "end" : dl.align === "center" ? "middle" : place.anchor, attrs = {
    "text-anchor": anchor,
    ...FONTS.dataLabel,
    fill: dl.color ?? FONTS.dataLabel.fill,
    "font-size": dataLabelFontSize(dl)
  };
  if (place.verticalAlign && (attrs["dominant-baseline"] = place.verticalAlign), dl.fontWeight && (attrs["font-weight"] = dl.fontWeight), dl.rotation && (attrs.transform = `rotate(${dl.rotation} ${place.x} ${place.y})`), dl.backgroundColor) {
    let w = text.length * 6.5 + 8, anchorX = anchor === "start" ? place.x - 4 : anchor === "end" ? place.x - w + 4 : place.x - w / 2, chipY = place.verticalAlign === "middle" ? place.y - 7.5 : place.y - 11;
    renderer.create("rect", {
      x: anchorX,
      y: chipY,
      width: w,
      height: 15,
      rx: 3,
      fill: dl.backgroundColor
    }, parent);
  }
  renderer.text(text, place.x, place.y, attrs, parent);
}
function drawPointLabels(renderer, parent, dl, seriesName, data, seriesColor) {
  if (!dl?.enabled) return;
  let d = dl.distance ?? 0, pos = dl.position ?? "top", total = data.reduce((sum2, { p }) => sum2 + (p.y ?? 0), 0);
  for (let { pt, p } of data) {
    let text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: seriesName,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? seriesColor,
      total,
      percentage: total ? (p.y ?? 0) / total * 100 : void 0
    }), place;
    switch (pos) {
      case "bottom":
        place = { x: pt.x, y: pt.y + 16 + d, anchor: "middle" };
        break;
      case "center":
        place = { x: pt.x, y: pt.y + 4, anchor: "middle" };
        break;
      case "left":
        place = { x: pt.x - 8 - d, y: pt.y + 4, anchor: "end" };
        break;
      case "right":
        place = { x: pt.x + 8 + d, y: pt.y + 4, anchor: "start" };
        break;
      default:
        place = { x: pt.x, y: pt.y - 8 - d, anchor: "middle" };
    }
    drawDataLabel(renderer, parent, text, place, dl);
  }
}

// src/series/polar.ts
function polarCenter(ctx) {
  return {
    x: ctx.plot.x + ctx.plot.width / 2,
    y: ctx.plot.y + ctx.plot.height / 2
  };
}
function polarPoint(ctx, xValue, yValue) {
  let x = ctx.xScale.scale(xValue), y = ctx.yScale.scale(yValue), angle = ctx.inverted ? y : x, radius = ctx.inverted ? x : y, center = polarCenter(ctx);
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}
function projectPolar(plot, angle, radius) {
  return {
    x: plot.x + plot.width / 2 + Math.cos(angle) * radius,
    y: plot.y + plot.height / 2 + Math.sin(angle) * radius
  };
}
function annularSectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  let inner = Math.max(0, Math.min(innerRadius, outerRadius)), outer = Math.max(inner, outerRadius), large = endAngle - startAngle > Math.PI ? 1 : 0, outerStart = {
    x: cx + Math.cos(startAngle) * outer,
    y: cy + Math.sin(startAngle) * outer
  }, outerEnd = {
    x: cx + Math.cos(endAngle) * outer,
    y: cy + Math.sin(endAngle) * outer
  };
  if (inner <= 0.5)
    return [
      `M ${cx} ${cy}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
      "Z"
    ].join(" ");
  let innerEnd = {
    x: cx + Math.cos(endAngle) * inner,
    y: cy + Math.sin(endAngle) * inner
  }, innerStart = {
    x: cx + Math.cos(startAngle) * inner,
    y: cy + Math.sin(startAngle) * inner
  };
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
}
function circularArcPath(cx, cy, radius, startAngle, endAngle) {
  let start = Math.min(startAngle, endAngle), end = Math.max(startAngle, endAngle), from = {
    x: cx + Math.cos(start) * radius,
    y: cy + Math.sin(start) * radius
  }, to = {
    x: cx + Math.cos(end) * radius,
    y: cy + Math.sin(end) * radius
  };
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${to.x} ${to.y}`;
}

// src/series/line.ts
var LineSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !0 };
  }
  /** Preserve null values as path breaks instead of joining across them. */
  pixelSegments(ctx) {
    let segments = [], current = [], catScale = ctx.inverted ? ctx.yScale : ctx.xScale, valScale = ctx.inverted ? ctx.xScale : ctx.yScale;
    for (let p of this.points) {
      let y = p.stackHigh !== void 0 ? p.stackHigh : p.y;
      if (y === void 0) {
        current.length && segments.push(current), current = [];
        continue;
      }
      if (ctx.polar) {
        current.push({ pt: polarPoint(ctx, p.x, y), p });
        continue;
      }
      let catPx = catScale.scale(p.x), valPx = valScale.scale(y);
      current.push({
        pt: ctx.inverted ? { x: valPx, y: catPx } : { x: catPx, y: valPx },
        p
      });
    }
    return current.length && segments.push(current), segments;
  }
  pixelPoints(ctx) {
    return this.pixelSegments(ctx).flat();
  }
  buildPath(pts) {
    switch (this.type) {
      case "spline":
        return splinePath(pts);
      case "step":
        return stepPath(pts);
      default:
        return linePath(pts);
    }
  }
  render(ctx) {
    let { renderer } = ctx, g = renderer.group({ class: `facet-series facet-line ${this.name}` }, renderer.root), segments = this.pixelSegments(ctx), data = segments.flat();
    for (let segment of segments) {
      let points = ctx.polar && !ctx.inverted && segments.length === 1 && segment.length > 2 ? [...segment.map((d) => d.pt), segment[0].pt] : segment.map((d) => d.pt);
      renderer.create("path", {
        d: this.buildPath(points),
        fill: "none",
        stroke: this.color,
        "stroke-width": this.options.lineWidth ?? this.options.size ?? 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }, g);
    }
    this.renderMarkers(ctx, g, data), drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, data, this.color);
  }
  renderMarkers(ctx, g, data) {
    let marker = this.options.marker, visible = marker?.enabled === !0;
    for (let { pt, p } of data) {
      let el;
      visible ? el = drawMarker(ctx.renderer, g, pt.x, pt.y, {
        symbol: marker.symbol ?? "circle",
        radius: marker.radius ?? 4,
        fill: marker.fillColor ?? this.color,
        stroke: marker.lineColor ?? "#fff",
        strokeWidth: marker.lineWidth ?? 1,
        width: marker.width,
        height: marker.height
      }) : el = ctx.renderer.create("circle", {
        cx: pt.x,
        cy: pt.y,
        r: 8,
        fill: "transparent",
        "pointer-events": "all",
        class: "facet-point-hit"
      }, g), ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
  }
};

// src/series/area.ts
var AreaSeries = class extends LineSeries {
  smooth() {
    return this.type === "areaspline";
  }
  buildPath(pts) {
    return this.smooth() ? splinePath(pts) : linePath(pts);
  }
  render(ctx) {
    let { renderer } = ctx, g = renderer.group({ class: `facet-series facet-area ${this.name}` }, renderer.root), top = [], bottom = [], hover = [], catScale = ctx.polar ? ctx.xScale : ctx.inverted ? ctx.yScale : ctx.xScale, valScale = ctx.polar ? ctx.yScale : ctx.inverted ? ctx.xScale : ctx.yScale, drawSegment = () => {
      if (!top.length) return;
      let line = this.smooth() ? splinePath : linePath, reversedBottom = [...bottom].reverse(), topD = line(top), bottomD = line(reversedBottom).replace(/^M/, "L");
      renderer.create("path", {
        d: `${topD} ${bottomD} Z`,
        fill: alpha(this.color, this.options.fillOpacity ?? 0.35),
        stroke: "none"
      }, g), renderer.create("path", {
        d: ctx.polar && !ctx.inverted && top.length > 2 ? line([...top, top[0]]) : topD,
        fill: "none",
        stroke: this.color,
        "stroke-width": this.options.lineWidth ?? this.options.size ?? 2,
        "stroke-linejoin": "round"
      }, g), top = [], bottom = [];
    };
    for (let p of this.points) {
      let hi = p.stackHigh !== void 0 ? p.stackHigh : p.y;
      if (hi === void 0) {
        drawSegment();
        continue;
      }
      let lo = p.stackLow !== void 0 ? p.stackLow : 0, catPx = catScale.scale(p.x), topPt = ctx.polar ? polarPoint(ctx, p.x, hi) : ctx.inverted ? { x: valScale.scale(hi), y: catPx } : { x: catPx, y: valScale.scale(hi) }, botPt = ctx.polar ? polarPoint(ctx, p.x, lo) : ctx.inverted ? { x: valScale.scale(lo), y: catPx } : { x: catPx, y: valScale.scale(lo) };
      top.push(topPt), bottom.push(botPt), hover.push({ pt: topPt, p });
    }
    drawSegment(), this.renderMarkers(ctx, g, hover), drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, hover, this.color);
  }
};

// src/series/registry.ts
var REGISTRY = /* @__PURE__ */ Object.create(null);
function createSeries(type, options, categories) {
  let Ctor = REGISTRY[type];
  if (!Ctor)
    throw new Error(
      `FacetViz: unknown series type "${type}". Import "facetviz/series/all" or the matching "facetviz/series/<family>" module.`
    );
  return new Ctor(options, categories);
}
function registerSeriesType(type, ctor) {
  REGISTRY[type] = ctor;
}
function registerSeriesTypes(types, ctor) {
  for (let type of types) registerSeriesType(type, ctor);
}
function isSeriesTypeRegistered(type) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type);
}

// src/entries/series/area.ts
var registerAreaSeries = () => registerSeriesTypes(["area", "areaspline"], AreaSeries);
registerAreaSeries();

// src/series/boxplot.ts
var BoxplotSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    return p.box ? [p.box.min, p.box.max, ...p.box.outliers ?? []] : [p.low, p.high];
  }
  render(ctx) {
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, layer = renderer.group({ class: `facet-series facet-boxplot ${this.name}` }, renderer.root), band = catScale.bandwidth(), subWidth = band / groupCount, boxWidth = subWidth * 0.7, half = boxWidth / 2, v = (val) => valScale.scale(val);
    for (let p of this.points) {
      let box = p.box;
      if (!box) continue;
      let base = p.color ?? this.color, bc = { ...this.options.boxColors, ...p.options.boxColors }, upperFill = bc.upper ?? shade(base, 0.15), lowerFill = bc.lower ?? shade(base, 0.5), stroke = bc.border ?? shade(base, -0.25), whisker = bc.whisker ?? stroke, medianColor = bc.median ?? stroke, c = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, lo = c - half, valLine = (a, b) => inverted ? { x1: v(a), y1: c, x2: v(b), y2: c } : { x1: c, y1: v(a), x2: c, y2: v(b) }, cap = (val, len) => inverted ? { x1: v(val), y1: c - len, x2: v(val), y2: c + len } : { x1: c - len, y1: v(val), x2: c + len, y2: v(val) }, boxRect = (a, b) => {
        let va = v(a), vb = v(b);
        return inverted ? { x: Math.min(va, vb), y: lo, width: Math.max(1, Math.abs(vb - va)), height: boxWidth } : { x: lo, y: Math.min(va, vb), width: boxWidth, height: Math.max(1, Math.abs(vb - va)) };
      }, medLine = () => inverted ? { x1: v(box.median), y1: lo, x2: v(box.median), y2: lo + boxWidth } : { x1: lo, y1: v(box.median), x2: lo + boxWidth, y2: v(box.median) }, g = renderer.group({ class: "facet-point" }, layer);
      renderer.create("line", { ...valLine(box.min, box.q1), stroke: whisker, "stroke-width": 1 }, g), renderer.create("line", { ...valLine(box.q3, box.max), stroke: whisker, "stroke-width": 1 }, g), renderer.create("line", { ...cap(box.min, half * 0.7), stroke: whisker }, g), renderer.create("line", { ...cap(box.max, half * 0.7), stroke: whisker }, g), renderer.create("rect", { ...boxRect(box.median, box.q3), fill: upperFill, stroke, "stroke-width": 1 }, g), renderer.create("rect", { ...boxRect(box.q1, box.median), fill: lowerFill, stroke, "stroke-width": 1 }, g), renderer.create("line", { ...medLine(), stroke: medianColor, "stroke-width": 2 }, g);
      let om = { ...this.options.outlierMarker, ...p.options.outlierMarker }, outlierR = om.radius ?? Math.min(4, half * 0.5);
      if (om.enabled !== !1)
        for (let val of box.outliers ?? []) {
          let pos = v(val), oc = inverted ? { x: pos, y: c } : { x: c, y: pos };
          drawMarker(renderer, g, oc.x, oc.y, {
            symbol: om.symbol ?? "circle",
            radius: outlierR,
            fill: om.fillColor ?? THEME.backgroundColor,
            stroke: om.lineColor ?? stroke,
            strokeWidth: om.lineWidth ?? 1.5,
            width: om.width,
            height: om.height
          });
        }
      ctx.registerHover(g, p), g.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), g.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), g.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
  }
};
function computeBoxStats(values) {
  let s = [...values].sort((a, b) => a - b), q = (p) => {
    let idx = p * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[s.length - 1] };
}

// src/entries/series/boxplot.ts
var registerBoxplotSeries = () => registerSeriesType("boxplot", BoxplotSeries);
registerBoxplotSeries();

// src/series/bubble.ts
var BubbleSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  render(ctx) {
    let { renderer, xScale, yScale } = ctx, g = renderer.group({ class: `facet-series facet-bubble ${this.name}` }, renderer.root), zs = this.points.map((p) => p.options.z ?? 1), [zMin, zMax] = extent(zs), [rMin, rMax] = this.options.sizeRange ?? [6, 34], radiusFor = (z) => {
      let t = zMax === zMin ? 1 : (z - zMin) / (zMax - zMin);
      return Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
    }, labelData = [], marker = this.options.marker ?? {};
    for (let p of this.points) {
      if (p.y === void 0) continue;
      let x = xScale.scale(p.x), y = yScale.scale(p.y), base = p.color ?? this.color, radius = radiusFor(p.options.z ?? 1), el = marker.enabled === !1 ? renderer.create("circle", {
        cx: x,
        cy: y,
        r: Math.max(8, radius),
        fill: "transparent",
        "pointer-events": "all",
        class: "facet-point-hit"
      }, g) : drawMarker(renderer, g, x, y, {
        symbol: marker.symbol ?? "circle",
        radius,
        fill: marker.fillColor ?? alpha(base, 0.55),
        stroke: marker.lineColor ?? base,
        strokeWidth: marker.lineWidth ?? 1,
        width: marker.width,
        height: marker.height
      });
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e)), labelData.push({ pt: { x, y }, p });
    }
    drawPointLabels(renderer, g, this.options.dataLabels, this.name, labelData, this.color);
  }
};

// src/entries/series/bubble.ts
var registerBubbleSeries = () => registerSeriesType("bubble", BubbleSeries);
registerBubbleSeries();

// src/series/bullet.ts
var BulletSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot } = ctx, g = renderer.group({ class: `facet-series facet-bullet ${this.name}` }, renderer.root), points = this.visiblePoints();
    if (!points.length) return;
    let labelW = 8 + points.reduce((m, p) => Math.max(m, String(p.name ?? p.x).length), 0) * 6.6, gx = plot.x + labelW, gw = plot.width - labelW - 12, rowH = plot.height / points.length, bandShades = ["#e6e6e6", "#d0d0d0", "#bcbcbc", "#a8a8a8"];
    points.forEach((p, i) => {
      let ranges = p.options.ranges ?? [], target = p.options.target, value = p.y ?? 0, max = Math.max(value, target ?? 0, ...ranges) || 1, sx = (v) => gx + v / max * gw, cy = plot.y + i * rowH + rowH / 2, h = Math.min(rowH * 0.6, 34);
      [...ranges].map((v, idx) => ({ v, idx })).sort((a, b) => b.v - a.v).forEach(({ v, idx }) => {
        renderer.create("rect", { x: gx, y: cy - h / 2, width: sx(v) - gx, height: h, fill: bandShades[idx % bandShades.length] }, g);
      });
      let el = renderer.create("rect", { x: gx, y: cy - h / 5, width: sx(value) - gx, height: h * 2 / 5, fill: p.color ?? this.color, class: "facet-point" }, g);
      typeof target == "number" && renderer.create("line", { x1: sx(target), y1: cy - h / 2, x2: sx(target), y2: cy + h / 2, stroke: "#333", "stroke-width": 2.5 }, g), renderer.text(String(p.name ?? p.x), gx - 6, cy, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g), ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }), renderer.create("line", { x1: gx, y1: plot.y, x2: gx, y2: plot.y + plot.height, stroke: THEME.axis.lineColor }, g);
  }
};

// src/entries/series/bullet.ts
var registerBulletSeries = () => registerSeriesType("bullet", BulletSeries);
registerBulletSeries();

// src/series/calendar.ts
var MONTHS2 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DAY = 864e5, CalendarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot } = ctx, g = renderer.group({ class: `facet-series facet-calendar ${this.name}` }, renderer.root), days = this.points.map((p) => ({ date: new Date(p.options.date ?? p.x), value: p.options.value ?? p.y ?? 0, point: p })).filter((d) => !Number.isNaN(d.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!days.length) return;
    let values = days.map((d) => d.value), min = Math.min(...values), max = Math.max(...values), first = days[0].date, start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    let dayOrdinal = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY, startDay = dayOrdinal(start), weekIndex = (d) => Math.floor((dayOrdinal(d) - startDay) / 7), topPad = 16, leftPad = 26, weeks = weekIndex(days[days.length - 1].date) + 1, cell = Math.min((plot.width - leftPad) / weeks, (plot.height - topPad) / 7) - 2, step = cell + 2, gridW = weeks * step, gx = plot.x + leftPad + Math.max(0, (plot.width - leftPad - gridW) / 2), gy = plot.y + topPad;
    ["", "Mon", "", "Wed", "", "Fri", ""].forEach((lbl, i) => {
      lbl && renderer.text(lbl, gx - 5, gy + i * step + cell / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel, "font-size": scaledFontPx(9) }, g);
    });
    let lastMonth = -1;
    for (let d of days) {
      let wk = weekIndex(d.date), wd = d.date.getDay(), x = gx + wk * step, y = gy + wd * step, t = max === min ? 0.5 : (d.value - min) / (max - min), el = renderer.create("rect", {
        x,
        y,
        width: cell,
        height: cell,
        rx: 2,
        fill: d.point.color ?? lerpColor("#eaf3fb", this.color, t),
        stroke: THEME.axis.gridLineColor,
        "stroke-width": 0.5,
        class: "facet-point"
      }, g);
      ctx.registerHover(el, d.point), el.addEventListener("click", (e) => ctx.onPointEvent("click", d.point, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", d.point, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", d.point, e)), d.date.getMonth() !== lastMonth && (lastMonth = d.date.getMonth(), renderer.text(MONTHS2[lastMonth], x, plot.y + 9, { "text-anchor": "start", ...FONTS.axisLabel, "font-size": scaledFontPx(9) }, g));
    }
  }
};

// src/entries/series/calendar.ts
var registerCalendarSeries = () => registerSeriesType("calendar", CalendarSeries);
registerCalendarSeries();

// src/series/candlestick.ts
var UP = "#26a69a", DOWN = "#ef5350", CandlestickSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    let o = p.options;
    return [o.low, o.high];
  }
  render(ctx) {
    let { renderer, yScale } = ctx, catScale = ctx.xScale, g = renderer.group({ class: `facet-series facet-candlestick ${this.name}` }, renderer.root), bodyW = Math.min(catScale.bandwidth() * 0.6, 18);
    for (let p of this.points) {
      let o = p.options, open = o.open, close = o.close, high = o.high, low = o.low;
      if ([open, close, high, low].some((v) => typeof v != "number")) continue;
      let cx = catScale.scale(p.x), up = close >= open, color = p.color ?? (up ? UP : DOWN), cell = renderer.group({ class: "facet-point" }, g);
      renderer.create("line", {
        x1: cx,
        y1: yScale.scale(high),
        x2: cx,
        y2: yScale.scale(low),
        stroke: color,
        "stroke-width": 1
      }, cell);
      let yOpen = yScale.scale(open), yClose = yScale.scale(close);
      renderer.create("rect", {
        x: cx - bodyW / 2,
        y: Math.min(yOpen, yClose),
        width: bodyW,
        height: Math.max(1, Math.abs(yClose - yOpen)),
        fill: color,
        stroke: color
      }, cell), ctx.registerHover(cell, p), cell.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), cell.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), cell.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
  }
};

// src/entries/series/candlestick.ts
var registerCandlestickSeries = () => registerSeriesType("candlestick", CandlestickSeries);
registerCandlestickSeries();

// src/series/column.ts
function roundedBarPath(rect, radius, side) {
  let { x, y, width, height } = rect, r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) return `M${x},${y} h${width} v${height} h${-width} Z`;
  switch (side) {
    case "top":
      return `M${x},${y + height} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} V${y + height} Z`;
    case "bottom":
      return `M${x},${y} H${x + width} V${y + height - r} A${r},${r} 0 0 1 ${x + width - r},${y + height} H${x + r} A${r},${r} 0 0 1 ${x},${y + height - r} V${y} Z`;
    case "right":
      return `M${x},${y} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} V${y + height - r} A${r},${r} 0 0 1 ${x + width - r},${y + height} H${x} Z`;
    case "left":
      return `M${x + width},${y} V${y + height} H${x + r} A${r},${r} 0 0 1 ${x},${y + height - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + width} Z`;
  }
}
var ColumnSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !0 };
  }
  pointValues(p) {
    return p.stackHigh !== void 0 ? [p.stackLow, p.stackHigh] : [0, p.y];
  }
  render(ctx) {
    if (ctx.polar) {
      this.renderPolar(ctx);
      return;
    }
    let { renderer, groupCount, groupIndex } = ctx, horizontal = this.type === "bar" || ctx.inverted, catScale = horizontal ? ctx.yScale : ctx.xScale, valScale = horizontal ? ctx.xScale : ctx.yScale, g = renderer.group({
      class: `facet-series facet-column ${this.name}`
    }), subWidth = catScale.bandwidth() / groupCount;
    for (let p of this.points) {
      let [loVal, hiVal] = this.valuePair(p);
      if (loVal === void 0 || hiVal === void 0) continue;
      let vLo = valScale.scale(loVal), vHi = valScale.scale(hiVal), max_colWidth = Math.max(1, subWidth * 0.9), explicitColWidth = p.options.columnWidth ?? this.options.columnWidth ?? this.options.size, colWidth = explicitColWidth != null ? explicitColWidth * FONT_SCALE_STATE.scale : max_colWidth, center = catScale.scale(p.x), columnGap = subWidth - max_colWidth, groupWidth = groupCount * colWidth + (groupCount - 1) * columnGap, catStart = center - groupWidth / 2 + groupIndex * (colWidth + columnGap), rect;
      horizontal ? rect = {
        x: Math.min(vLo, vHi),
        y: catStart,
        width: Math.max(1, Math.abs(vHi - vLo)),
        height: colWidth
      } : rect = {
        x: catStart,
        y: Math.min(vLo, vHi),
        width: colWidth,
        height: Math.max(1, Math.abs(vHi - vLo))
      };
      let borderRadius = p.options.borderRadius ?? this.options.borderRadius ?? 0, fill = p.color ?? this.color, el;
      if (borderRadius > 0) {
        let side = horizontal ? vHi >= vLo ? "right" : "left" : vHi <= vLo ? "top" : "bottom";
        el = renderer.create(
          "path",
          {
            d: roundedBarPath(rect, borderRadius, side),
            fill,
            class: "facet-point"
          },
          g
        );
      } else
        el = renderer.create(
          "rect",
          { ...rect, rx: 1, fill, class: "facet-point" },
          g
        );
      ctx.registerHover(el, p), this.wireEvents(el, p, ctx), this.drawDataLabel(ctx, p, rect, g);
    }
  }
  renderPolar(ctx) {
    let { renderer, groupCount, groupIndex } = ctx, group = renderer.group({
      class: `facet-series facet-column facet-polar-column ${this.name}`
    }), center = polarCenter(ctx);
    if (ctx.inverted) {
      let band2 = ctx.xScale.bandwidth() || Math.max(1, ctx.plot.width / 2 / Math.max(1, this.points.length)), slot2 = band2 / groupCount;
      for (let p of this.points) {
        let [loValue, hiValue] = this.valuePair(p);
        if (loValue === void 0 || hiValue === void 0) continue;
        let inner = ctx.xScale.scale(p.x) - band2 / 2 + groupIndex * slot2 + slot2 * 0.05, outer = inner + slot2 * 0.9, lo = ctx.yScale.scale(loValue), hi = ctx.yScale.scale(hiValue), start = Math.min(lo, hi), end = Math.max(lo, hi), el = renderer.create(
          "path",
          {
            d: annularSectorPath(
              center.x,
              center.y,
              Math.max(0, inner),
              Math.max(1, outer),
              start,
              end
            ),
            fill: p.color ?? this.color,
            class: "facet-point facet-polar-sector facet-polar-inverted-sector"
          },
          group
        );
        if (ctx.registerHover(el, p), this.wireEvents(el, p, ctx), this.options.dataLabels?.enabled) {
          let point = projectPolar(ctx.plot, hi, outer + 8), total = this.points.reduce(
            (sum2, item) => sum2 + (item.y ?? 0),
            0
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
              percentage: total ? (p.y ?? 0) / total * 100 : void 0
            }),
            {
              x: point.x,
              y: point.y,
              anchor: Math.cos(hi) < -0.15 ? "end" : Math.cos(hi) > 0.15 ? "start" : "middle"
            },
            this.options.dataLabels
          );
        }
      }
      return;
    }
    let band = ctx.xScale.bandwidth() || Math.PI * 2 / Math.max(1, this.points.length), slot = band / groupCount;
    for (let p of this.points) {
      let [loValue, hiValue] = this.valuePair(p);
      if (loValue === void 0 || hiValue === void 0) continue;
      let start = ctx.xScale.scale(p.x) - band / 2 + groupIndex * slot + slot * 0.05, end = start + slot * 0.9, lo = ctx.yScale.scale(loValue), hi = ctx.yScale.scale(hiValue), inner = Math.min(lo, hi), outer = Math.max(lo, hi), el = renderer.create(
        "path",
        {
          d: annularSectorPath(center.x, center.y, inner, outer, start, end),
          fill: p.color ?? this.color,
          class: "facet-point facet-polar-sector"
        },
        group
      );
      if (ctx.registerHover(el, p), this.wireEvents(el, p, ctx), this.options.dataLabels?.enabled) {
        let mid = (start + end) / 2, point = projectPolar(ctx.plot, mid, outer + 8), total = this.points.reduce((sum2, item) => sum2 + (item.y ?? 0), 0);
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
            percentage: total ? (p.y ?? 0) / total * 100 : void 0
          }),
          {
            x: point.x,
            y: point.y,
            anchor: Math.cos(mid) < -0.15 ? "end" : Math.cos(mid) > 0.15 ? "start" : "middle"
          },
          this.options.dataLabels
        );
      }
    }
  }
  /** The [low, high] value pair driving the rectangle for this point. */
  valuePair(p) {
    return p.stackHigh !== void 0 ? [p.stackLow, p.stackHigh] : [0, p.y];
  }
  wireEvents(el, p, ctx) {
    el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener(
      "mouseover",
      (e) => ctx.onPointEvent("mouseOver", p, e)
    ), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
  }
  drawDataLabel(ctx, p, rect, parent) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let total = this.points.reduce((s, pt) => s + (pt.y ?? 0), 0), text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color,
      total,
      percentage: total ? (p.y ?? 0) / total * 100 : void 0
    }), d = dl.distance ?? 0, pos = dl.position ?? (p.stackHigh !== void 0 ? "center" : "outside"), place;
    if (this.type === "bar" || ctx.inverted) {
      let cy = rect.y + rect.height / 2, end = rect.x + rect.width;
      pos === "inside" ? place = { x: end - 4 - d, y: cy, anchor: "end", verticalAlign: "middle" } : pos === "center" ? place = {
        x: rect.x + rect.width / 2,
        y: cy,
        anchor: "middle",
        verticalAlign: "middle"
      } : pos === "base" ? place = { x: rect.x + 4 + d, y: cy, anchor: "start", verticalAlign: "middle" } : place = { x: end + 4 + d, y: cy, anchor: "start", verticalAlign: "middle" };
    } else {
      let cx = rect.x + rect.width / 2;
      pos === "inside" ? place = { x: cx, y: rect.y + 12 + d, anchor: "middle" } : pos === "center" ? place = {
        x: cx,
        y: rect.y + rect.height / 2,
        anchor: "middle",
        verticalAlign: "middle"
      } : pos === "base" ? place = { x: cx, y: rect.y + rect.height - 5 - d, anchor: "middle" } : place = { x: cx, y: rect.y - 4 - d, anchor: "middle" };
    }
    drawDataLabel(ctx.renderer, parent, text, place, dl);
  }
};

// src/entries/series/column.ts
var registerColumnSeries = () => registerSeriesTypes(["bar", "column", "butterfly"], ColumnSeries);
registerColumnSeries();

// src/series/columnrange.ts
var ColumnRangeSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, g = renderer.group({ class: `facet-series facet-columnrange ${this.name}` }, renderer.root), band = catScale.bandwidth(), subWidth = band / groupCount, thickness = Math.min(subWidth * 0.55, 26);
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, vLow = valScale.scale(p.low), vHigh = valScale.scale(p.high), coords = inverted ? { x1: vLow, y1: cat, x2: vHigh, y2: cat } : { x1: cat, y1: vLow, x2: cat, y2: vHigh }, el = renderer.create("line", {
        ...coords,
        stroke: p.color ?? this.color,
        "stroke-width": thickness,
        "stroke-linecap": "round",
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e)), this.drawEndLabels(ctx, p, cat, vLow, vHigh, inverted, thickness / 2);
    }
  }
  /** Labels at the low and high ends of the capsule. */
  drawEndLabels(ctx, p, cat, vLow, vHigh, inverted, half) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let ends = [
      { val: p.low, v: vLow, isHigh: !1 },
      { val: p.high, v: vHigh, isHigh: !0 }
    ];
    for (let end of ends) {
      let text = labelString(dl, {
        x: p.x,
        y: end.val,
        low: p.low,
        high: p.high,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? this.color
      }), d = (dl.distance ?? 0) + half + 4, place;
      inverted ? place = end.isHigh ? { x: end.v + d, y: cat + 4, anchor: "start" } : { x: end.v - d, y: cat + 4, anchor: "end" } : place = end.isHigh ? { x: cat, y: end.v - d, anchor: "middle" } : { x: cat, y: end.v + d + 10, anchor: "middle" }, drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
};

// src/entries/series/columnrange.ts
var registerColumnRangeSeries = () => registerSeriesType("columnrange", ColumnRangeSeries);
registerColumnRangeSeries();

// src/series/dumbbell.ts
var DumbbellSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    if (ctx.polar) {
      this.renderPolar(ctx);
      return;
    }
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, g = renderer.group(
      { class: `facet-series facet-dumbbell ${this.name}` },
      renderer.root
    ), band = catScale.bandwidth ? catScale.bandwidth() : 0, subWidth = band / groupCount, radius = this.options.marker?.radius ?? 5, rectWidth = this.options.marker?.width ?? 5, rectHeight = this.options.marker?.height ?? 5, isRect = this.options.marker?.enabled !== !1 && this.options.marker?.symbol === "rectangle", markerHalfAlongValue = isRect ? (inverted ? rectWidth : rectHeight) / 2 : radius;
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let lowColor = p.options.lowColor ?? this.options.lowColor ?? this.color, highColor = p.options.highColor ?? this.options.highColor ?? this.color, connColor = p.options.connectorColor ?? this.options.connectorColor ?? THEME.neutralColor, connWidth = p.options.connectorWidth ?? this.options.connectorWidth ?? 7, cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, vLow = valScale.scale(p.low), vHigh = valScale.scale(p.high), conn = isRect ? inverted ? {
        x1: vLow < vHigh ? vLow + markerHalfAlongValue : vLow - markerHalfAlongValue,
        y1: cat,
        x2: vLow < vHigh ? vHigh - markerHalfAlongValue : vHigh + markerHalfAlongValue,
        y2: cat
      } : {
        x1: cat,
        y1: vLow < vHigh ? vLow + markerHalfAlongValue : vLow - markerHalfAlongValue,
        x2: cat,
        y2: vLow < vHigh ? vHigh - markerHalfAlongValue : vHigh + markerHalfAlongValue
      } : inverted ? { x1: vLow, y1: cat, x2: vHigh, y2: cat } : { x1: cat, y1: vLow, x2: cat, y2: vHigh };
      renderer.create(
        "line",
        {
          ...conn,
          stroke: connColor,
          "stroke-width": connWidth
        },
        g
      );
      for (let [v, color] of [
        [vLow, lowColor],
        [vHigh, highColor]
      ]) {
        let cx = inverted ? v : cat, cy = inverted ? cat : v, marker = this.options.marker ?? {}, el = marker.enabled === !1 ? renderer.create("circle", {
          cx,
          cy,
          r: Math.max(8, radius),
          fill: "transparent",
          "pointer-events": "all",
          class: "facet-point-hit"
        }, g) : drawMarker(renderer, g, cx, cy, {
          symbol: marker.symbol ?? "circle",
          radius,
          fill: marker.fillColor ?? color,
          stroke: marker.lineColor ?? "#fff",
          strokeWidth: marker.lineWidth ?? 1.5,
          width: rectWidth,
          height: rectHeight
        });
        ctx.registerHover(el, p), el.addEventListener(
          "click",
          (e) => ctx.onPointEvent("click", p, e)
        ), el.addEventListener(
          "mouseover",
          (e) => ctx.onPointEvent("mouseOver", p, e)
        ), el.addEventListener(
          "mouseout",
          (e) => ctx.onPointEvent("mouseOut", p, e)
        );
      }
      this.drawEndLabels(ctx, p, cat, valScale, inverted, radius);
    }
  }
  /** Draw each low/high pair along the category's radial spoke. */
  renderPolar(ctx) {
    if (ctx.inverted) {
      this.renderInvertedPolar(ctx);
      return;
    }
    let { renderer, groupCount, groupIndex } = ctx, catScale = ctx.xScale, g = renderer.group(
      {
        class: `facet-series facet-dumbbell facet-polar-dumbbell ${this.name}`
      },
      renderer.root
    ), band = catScale.bandwidth ? catScale.bandwidth() : 0, subWidth = band / groupCount, radius = this.options.marker?.radius ?? 5, rectWidth = this.options.marker?.width ?? 5, rectHeight = this.options.marker?.height ?? 5;
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let lowColor = p.options.lowColor ?? this.options.lowColor ?? this.color, highColor = p.options.highColor ?? this.options.highColor ?? this.color, connColor = p.options.connectorColor ?? this.options.connectorColor ?? THEME.neutralColor, connWidth = p.options.connectorWidth ?? this.options.connectorWidth ?? 7, angle = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, lowRadius = ctx.yScale.scale(p.low), highRadius = ctx.yScale.scale(p.high), low = projectPolar(ctx.plot, angle, lowRadius), high = projectPolar(ctx.plot, angle, highRadius);
      renderer.create(
        "line",
        {
          x1: low.x,
          y1: low.y,
          x2: high.x,
          y2: high.y,
          stroke: connColor,
          "stroke-width": connWidth,
          class: "facet-dumbbell-connector"
        },
        g
      );
      for (let [point, color] of [
        [low, lowColor],
        [high, highColor]
      ]) {
        let marker = this.options.marker ?? {}, el = marker.enabled === !1 ? renderer.create(
          "circle",
          {
            cx: point.x,
            cy: point.y,
            r: Math.max(8, radius),
            fill: "transparent",
            "pointer-events": "all",
            class: "facet-point-hit"
          },
          g
        ) : drawMarker(renderer, g, point.x, point.y, {
          symbol: marker.symbol ?? "circle",
          radius,
          fill: marker.fillColor ?? color,
          stroke: marker.lineColor ?? "#fff",
          strokeWidth: marker.lineWidth ?? 1.5,
          width: rectWidth,
          height: rectHeight
        });
        ctx.registerHover(el, p), el.addEventListener(
          "click",
          (e) => ctx.onPointEvent("click", p, e)
        ), el.addEventListener(
          "mouseover",
          (e) => ctx.onPointEvent("mouseOver", p, e)
        ), el.addEventListener(
          "mouseout",
          (e) => ctx.onPointEvent("mouseOut", p, e)
        );
      }
      this.drawPolarEndLabels(
        ctx,
        p,
        angle,
        lowRadius,
        highRadius,
        radius
      );
    }
  }
  /** In inverted polar mode the pair shares an x radius and spans y angles. */
  renderInvertedPolar(ctx) {
    let { renderer, groupCount, groupIndex } = ctx, catScale = ctx.xScale, g = renderer.group(
      {
        class: `facet-series facet-dumbbell facet-polar-dumbbell facet-polar-inverted-dumbbell ${this.name}`
      },
      renderer.root
    ), center = polarCenter(ctx), band = catScale.bandwidth ? catScale.bandwidth() : 0, subWidth = band / groupCount, markerRadius = this.options.marker?.radius ?? 5, marker = this.options.marker ?? {};
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let lowColor = p.options.lowColor ?? this.options.lowColor ?? this.color, highColor = p.options.highColor ?? this.options.highColor ?? this.color, connColor = p.options.connectorColor ?? this.options.connectorColor ?? THEME.neutralColor, connWidth = p.options.connectorWidth ?? this.options.connectorWidth ?? 7, radial = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, lowAngle = ctx.yScale.scale(p.low), highAngle = ctx.yScale.scale(p.high), low = projectPolar(ctx.plot, lowAngle, radial), high = projectPolar(ctx.plot, highAngle, radial);
      renderer.create(
        "path",
        {
          d: circularArcPath(
            center.x,
            center.y,
            radial,
            lowAngle,
            highAngle
          ),
          fill: "none",
          stroke: connColor,
          "stroke-width": connWidth,
          class: "facet-dumbbell-connector facet-dumbbell-arc-connector"
        },
        g
      );
      for (let [point, color] of [
        [low, lowColor],
        [high, highColor]
      ]) {
        let el = marker.enabled === !1 ? renderer.create(
          "circle",
          {
            cx: point.x,
            cy: point.y,
            r: Math.max(8, markerRadius),
            fill: "transparent",
            "pointer-events": "all",
            class: "facet-point-hit"
          },
          g
        ) : drawMarker(renderer, g, point.x, point.y, {
          symbol: marker.symbol ?? "circle",
          radius: markerRadius,
          fill: marker.fillColor ?? color,
          stroke: marker.lineColor ?? "#fff",
          strokeWidth: marker.lineWidth ?? 1.5,
          width: marker.width ?? 5,
          height: marker.height ?? 5
        });
        ctx.registerHover(el, p), el.addEventListener(
          "click",
          (e) => ctx.onPointEvent("click", p, e)
        ), el.addEventListener(
          "mouseover",
          (e) => ctx.onPointEvent("mouseOver", p, e)
        ), el.addEventListener(
          "mouseout",
          (e) => ctx.onPointEvent("mouseOut", p, e)
        );
      }
      this.drawInvertedPolarEndLabels(
        ctx,
        p,
        radial,
        lowAngle,
        highAngle,
        markerRadius
      );
    }
  }
  drawInvertedPolarEndLabels(ctx, p, radial, lowAngle, highAngle, markerRadius) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let labelRadius = radial + markerRadius + 6 + (dl.distance ?? 0);
    for (let [value, angle] of [
      [p.low, lowAngle],
      [p.high, highAngle]
    ]) {
      let point = projectPolar(ctx.plot, angle, labelRadius), cosine = Math.cos(angle);
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
          color: p.color ?? this.color
        }),
        {
          x: point.x,
          y: point.y + 4,
          anchor: cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle"
        },
        dl
      );
    }
  }
  drawPolarEndLabels(ctx, p, angle, lowRadius, highRadius, markerRadius) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let distance = markerRadius + 6 + (dl.distance ?? 0);
    for (let [value, radial] of [
      [p.low, lowRadius],
      [p.high, highRadius]
    ]) {
      let outward = radial >= Math.max(lowRadius, highRadius), point = projectPolar(
        ctx.plot,
        angle,
        radial + (outward ? distance : -distance)
      ), cosine = Math.cos(angle), text = labelString(dl, {
        x: p.x,
        y: value,
        low: p.low,
        high: p.high,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? this.color
      });
      drawDataLabel(
        ctx.renderer,
        ctx.renderer.root,
        text,
        {
          x: point.x,
          y: point.y + 4,
          anchor: cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle"
        },
        dl
      );
    }
  }
  /** Labels at the low and high ends (both values shown by default). */
  drawEndLabels(ctx, p, cat, valScale, inverted, radius) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let ends = [
      { val: p.low, isHigh: p.low > p.high },
      { val: p.high, isHigh: p.low < p.high }
    ];
    for (let end of ends) {
      let v = valScale.scale(end.val), text = labelString(dl, {
        x: p.x,
        y: end.val,
        low: p.low,
        high: p.high,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? this.color
      }), d = dl.distance ?? 0, place;
      inverted ? place = end.isHigh ? { x: v + radius + 6 + d, y: cat + 4, anchor: "start" } : { x: v - radius - 6 - d, y: cat + 4, anchor: "end" } : place = end.isHigh ? { x: cat, y: v - radius - 6 - d, anchor: "middle" } : { x: cat, y: v + radius + 14 + d, anchor: "middle" }, drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
};

// src/entries/series/dumbbell.ts
var registerDumbbellSeries = () => registerSeriesType("dumbbell", DumbbellSeries);
registerDumbbellSeries();

// src/series/errorbar.ts
var ErrorBarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, g = renderer.group({ class: `facet-series facet-errorbar ${this.name}` }, renderer.root), band = catScale.bandwidth(), sub = band / groupCount, cap = Math.min(sub * 0.4, 8), stroke = this.color;
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let c = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * sub, vLo = valScale.scale(p.low), vHi = valScale.scale(p.high), line = (a) => renderer.create("line", { ...a, stroke, "stroke-width": 1.5, class: "facet-point" }, g), el = line(inverted ? { x1: vLo, y1: c, x2: vHi, y2: c } : { x1: c, y1: vLo, x2: c, y2: vHi });
      inverted ? (line({ x1: vLo, y1: c - cap, x2: vLo, y2: c + cap }), line({ x1: vHi, y1: c - cap, x2: vHi, y2: c + cap })) : (line({ x1: c - cap, y1: vLo, x2: c + cap, y2: vLo }), line({ x1: c - cap, y1: vHi, x2: c + cap, y2: vHi })), ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
  }
};

// src/entries/series/errorbar.ts
var registerErrorBarSeries = () => registerSeriesType("errorbar", ErrorBarSeries);
registerErrorBarSeries();

// src/series/funnel.ts
var FunnelSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1, pointLegend: !0 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-funnel ${this.name}` }, renderer.root), points = this.visiblePoints();
    if (!points.length) return;
    let max = Math.max(...points.map((p) => p.y ?? 0)) || 1, maxW = plot.width * 0.66, cx = plot.x + plot.width / 2, gap = 2, stageH = (plot.height - gap * (points.length - 1)) / points.length, w = (v) => v / max * maxW;
    points.forEach((p, i) => {
      let yTop = plot.y + i * (stageH + gap), yBot = yTop + stageH, topW = w(p.y ?? 0), botW = w(points[i + 1]?.y ?? p.y ?? 0), color = p.color ?? paletteColor(colors, i), poly = `${cx - topW / 2},${yTop} ${cx + topW / 2},${yTop} ${cx + botW / 2},${yBot} ${cx - botW / 2},${yBot}`, el = renderer.create("polygon", { points: poly, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      renderer.text(`${p.name ?? p.x}: ${p.y}`, cx, (yTop + yBot) / 2, {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: "#ffffff",
        "font-weight": "600"
      }, g), ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
};

// src/entries/series/funnel.ts
var registerFunnelSeries = () => registerSeriesType("funnel", FunnelSeries);
registerFunnelSeries();

// src/series/gantt.ts
var GanttSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-gantt ${this.name}` }, renderer.root), tasks = this.points.map((p) => ({ name: String(p.name ?? p.x), start: p.options.start ?? p.low ?? 0, end: p.options.end ?? p.high ?? 0, point: p })).filter((t) => t.end > t.start);
    if (!tasks.length) return;
    let min = Math.min(...tasks.map((t) => t.start)), max = Math.max(...tasks.map((t) => t.end)), isTime = min > 1e11, labelW = 8 + tasks.reduce((m, t) => Math.max(m, t.name.length), 0) * 6.4, gx = plot.x + labelW, gw = plot.width - labelW - 8, bottomPad = 22, gh = plot.height - bottomPad, sx = (v) => gx + (v - min) / (max - min || 1) * gw, rowH = gh / tasks.length;
    tasks.forEach((t, i) => {
      let y = plot.y + i * rowH, h = Math.min(rowH * 0.6, 26), bar = renderer.create("rect", {
        x: sx(t.start),
        y: y + (rowH - h) / 2,
        width: Math.max(2, sx(t.end) - sx(t.start)),
        height: h,
        rx: 4,
        fill: t.point.color ?? paletteColor(colors, i),
        class: "facet-point"
      }, g);
      ctx.registerHover(bar, t.point), bar.addEventListener("click", (e) => ctx.onPointEvent("click", t.point, e)), bar.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", t.point, e)), bar.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", t.point, e)), renderer.text(t.name, gx - 6, y + rowH / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g);
    });
    let baseY = plot.y + gh;
    renderer.create("line", { x1: gx, y1: baseY, x2: gx + gw, y2: baseY, stroke: THEME.axis.lineColor }, g);
    let ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      let v = min + (max - min) * i / ticks, x = sx(v);
      renderer.create("line", { x1: x, y1: baseY, x2: x, y2: baseY + 4, stroke: THEME.axis.lineColor }, g);
      let label = isTime ? formatDate(v, "%b %d") : String(Math.round(v));
      renderer.text(label, x, baseY + 14, { "text-anchor": "middle", ...FONTS.axisLabel }, g);
    }
  }
};

// src/entries/series/gantt.ts
var registerGanttSeries = () => registerSeriesType("gantt", GanttSeries);
registerGanttSeries();

// src/series/gauge.ts
function arcBandPath(cx, cy, rInner, rOuter, startDeg, endDeg) {
  if (endDeg <= startDeg) return "";
  let a0 = startDeg * Math.PI / 180, a1 = endDeg * Math.PI / 180, large = endDeg - startDeg > 180 ? 1 : 0, ox0 = cx + rOuter * Math.cos(a0), oy0 = cy + rOuter * Math.sin(a0), ox1 = cx + rOuter * Math.cos(a1), oy1 = cy + rOuter * Math.sin(a1), ix1 = cx + rInner * Math.cos(a1), iy1 = cy + rInner * Math.sin(a1), ix0 = cx + rInner * Math.cos(a0), iy0 = cy + rInner * Math.sin(a0);
  return `M ${ox0} ${oy0} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${rInner} ${rInner} 0 ${large} 0 ${ix0} ${iy0} Z`;
}
function pointOnCircle(cx, cy, r, deg) {
  let a = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
var GaugeSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot, inverted } = ctx, g = renderer.group(
      { class: `facet-series facet-gauge ${this.name}` },
      renderer.root
    ), points = this.visiblePoints();
    if (!points.length) return;
    let opts = this.options;
    points.forEach((p, index) => {
      let gaugePlot = inverted ? {
        x: plot.x,
        y: plot.y + plot.height * index / points.length,
        width: plot.width,
        height: plot.height / points.length
      } : {
        x: plot.x + plot.width * index / points.length,
        y: plot.y,
        width: plot.width / points.length,
        height: plot.height
      }, item = renderer.group(
        {
          class: "facet-gauge-item",
          "data-point-index": p.index
        },
        g
      );
      this.renderGauge(ctx, p, gaugePlot, item, opts);
    });
  }
  renderGauge(ctx, p, plot, g, opts) {
    let { renderer } = ctx, min = opts.min ?? 0, max = opts.max ?? 100, minLabel = opts.minLabel ?? String(min), maxLabel = opts.maxLabel ?? String(max), value = Math.max(min, Math.min(max, p.y ?? 0)), frac = max === min ? 0 : (value - min) / (max - min), START_DEG = 180, SWEEP_DEG = 180, END_DEG = START_DEG + SWEEP_DEG, cx = plot.x + plot.width / 2, cy = plot.y + plot.height * 0.7, radius = Math.min(plot.width * 0.42, plot.height * 0.55), requestedThickness = opts.thickness ?? Math.max(4, radius * 0.18), thickness = Math.min(requestedThickness, radius * 0.8), rOuter = radius, rInner = radius - thickness, trackColor = opts.trackColor ?? THEME.axis.gridLineColor, trackOpacity = opts.trackOpacity ?? 0.15;
    renderer.create(
      "path",
      {
        d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, END_DEG),
        fill: trackColor,
        opacity: trackOpacity,
        stroke: "none"
      },
      g
    );
    let valueEndDeg = START_DEG + SWEEP_DEG * frac, bandColor = p.color ?? this.color ?? opts.color;
    renderer.create(
      "path",
      {
        d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, valueEndDeg),
        fill: bandColor,
        stroke: "none"
      },
      g
    );
    let hitEl = renderer.create(
      "path",
      {
        d: arcBandPath(cx, cy, rInner, rOuter, START_DEG, END_DEG),
        fill: "transparent",
        stroke: "none",
        class: "facet-point"
      },
      g
    );
    if (ctx.registerHover(hitEl, p), hitEl.addEventListener(
      "click",
      (e) => ctx.onPointEvent("click", p, e)
    ), hitEl.addEventListener(
      "mouseover",
      (e) => ctx.onPointEvent("mouseOver", p, e)
    ), hitEl.addEventListener(
      "mouseout",
      (e) => ctx.onPointEvent("mouseOut", p, e)
    ), opts.markers && opts.markers.length) {
      let markers = opts.markers.map((m) => ({
        ...m,
        value: Math.max(min, Math.min(max, m.value)),
        label: m.label ?? String(m.value),
        color: m.color ?? bandColor,
        labelPosition: m.labelPosition ?? "outside",
        // Scaled/clamped like any other font-size option (sanitizeStyle),
        // rather than the literal pixel value rendered verbatim.
        fontSize: sanitizeStyle({ "font-size": m.fontSize ?? "10px" })["font-size"]
      })).sort((a, b) => a.value - b.value);
      for (let m of markers) {
        let mFrac = max === min ? 0 : (m.value - min) / (max - min), mDeg = START_DEG + SWEEP_DEG * mFrac, lineOuter = rOuter + 2, lineInner = rInner - 2, pOuter = pointOnCircle(cx, cy, lineOuter, mDeg), pInner = pointOnCircle(cx, cy, lineInner, mDeg);
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
            class: "facet-gauge-marker"
          },
          g
        );
        let labelRadius = m.labelPosition === "inside" ? (rInner + rOuter) / 2 : rOuter + 18, labelPt = pointOnCircle(cx, cy, labelRadius, mDeg), isRightSide = mDeg > 270 && mDeg < 360, isLeftSide = mDeg > 180 && mDeg < 270, anchor = isRightSide ? "start" : isLeftSide ? "end" : "middle", dx = isRightSide ? 4 : isLeftSide ? -4 : 0;
        renderer.text(
          m.label,
          labelPt.x + dx,
          labelPt.y + 4,
          {
            "text-anchor": anchor,
            ...FONTS.dataLabel,
            "font-size": m.fontSize,
            fill: m.color,
            class: "facet-gauge-marker-label"
          },
          g
        );
      }
    }
    if (opts.showMinMax !== !1) {
      let minPt = pointOnCircle(
        cx,
        cy,
        rOuter - (rOuter - rInner) / 2,
        START_DEG
      );
      renderer.text(
        minLabel,
        minPt.x,
        minPt.y + 20,
        {
          "text-anchor": "middle",
          ...FONTS.dataLabel,
          "font-size": scaledFontPx(11),
          fill: THEME.axis.labelColor
        },
        g
      );
      let maxPt = pointOnCircle(
        cx,
        cy,
        rInner + (rOuter - rInner) / 2,
        END_DEG
      );
      renderer.text(
        maxLabel,
        maxPt.x,
        maxPt.y + 20,
        {
          "text-anchor": "middle",
          ...FONTS.dataLabel,
          "font-size": scaledFontPx(11),
          fill: THEME.axis.labelColor
        },
        g
      );
    }
    let centerValue = opts.centerFormatter ? opts.centerFormatter(value) : String(value), centerFontSize = opts.centerFontSize ? parseFloat(sanitizeStyle({ "font-size": opts.centerFontSize })["font-size"]) : Math.max(10, Math.min(22, radius * 0.32));
    renderer.text(
      centerValue,
      cx,
      cy - rInner / 2 + centerFontSize / 2,
      {
        "text-anchor": "middle",
        ...FONTS.title,
        "font-size": `${centerFontSize}px`,
        fill: THEME.axis.titleColor,
        class: "facet-gauge-value"
      },
      g
    ), (p.name ?? this.name) && renderer.text(
      String(p.name ?? this.name),
      cx,
      cy,
      {
        "text-anchor": "middle",
        ...FONTS.subtitle,
        fill: THEME.axis.labelColor,
        class: "facet-gauge-label"
      },
      g
    );
  }
};

// src/entries/series/gauge.ts
var registerGaugeSeries = () => registerSeriesType("gauge", GaugeSeries);
registerGaugeSeries();

// src/series/heatmap.ts
var HeatmapSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  axisValues(field) {
    let seen = [];
    for (let p of this.points) {
      let v = String((field === "x" ? p.x : p.options.y) ?? "");
      seen.includes(v) || seen.push(v);
    }
    return seen;
  }
  render(ctx) {
    let { renderer, plot } = ctx, g = renderer.group({ class: `facet-series facet-heatmap ${this.name}` }, renderer.root), cols = this.axisValues("x"), rows = this.axisValues("y");
    if (!cols.length || !rows.length) return;
    let leftPad = 8 + rows.reduce((m, r) => Math.max(m, r.length), 0) * 6.6, bottomPad = 22, gx = plot.x + leftPad, gy = plot.y + 6, gw = plot.width - leftPad - 8, gh = plot.height - bottomPad - 6, cw = gw / cols.length, ch = gh / rows.length, values = this.points.map((p) => p.options.value ?? p.y ?? 0), min = Math.min(...values), max = Math.max(...values), lo = "#eaf3fb", hi = this.color, colorFor = (v) => lerpColor(lo, hi, max === min ? 0.5 : (v - min) / (max - min));
    for (let p of this.points) {
      let ci = cols.indexOf(String(p.x ?? "")), ri = rows.indexOf(String(p.options.y ?? ""));
      if (ci < 0 || ri < 0) continue;
      let value = p.options.value ?? p.y ?? 0, x = gx + ci * cw, y = gy + ri * ch, el = renderer.create("rect", {
        x: x + 1,
        y: y + 1,
        width: cw - 2,
        height: ch - 2,
        rx: 2,
        fill: p.color ?? colorFor(value),
        class: "facet-point"
      }, g);
      !ctx.suppressDataLabels && cw > 26 && ch > 16 && renderer.text(String(value), x + cw / 2, y + ch / 2, {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: (value - min) / (max - min || 1) > 0.6 ? "#fff" : shade(hi, -0.4),
        "font-size": scaledFontPx(10)
      }, g), ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
    cols.forEach((c, i) => {
      renderer.text(c, gx + i * cw + cw / 2, gy + gh + 14, { "text-anchor": "middle", ...FONTS.axisLabel }, g);
    }), rows.forEach((r, i) => {
      renderer.text(r, gx - 6, gy + i * ch + ch / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g);
    }), renderer.create("line", { x1: gx, y1: gy + gh, x2: gx + gw, y2: gy + gh, stroke: THEME.axis.lineColor }, g);
  }
};

// src/entries/series/heatmap.ts
var registerHeatmapSeries = () => registerSeriesType("heatmap", HeatmapSeries);
registerHeatmapSeries();

// src/series/histogram.ts
var HistogramSeries = class extends BaseSeries {
  constructor(options, categories) {
    super(options, categories);
    this.bins = [];
    this.bins = this.computeBins(), this.points = this.bins.map((b, i) => ({
      x: (b.x0 + b.x1) / 2,
      y: b.count,
      index: i,
      options: { x0: b.x0, x1: b.x1, y: b.count }
    }));
  }
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  valueExtent() {
    return [0, Math.max(1, ...this.bins.map((b) => b.count))];
  }
  computeBins() {
    let values = this.options.data.filter((v) => typeof v == "number");
    if (!values.length) return [];
    let min = Math.min(...values), max = Math.max(...values), count = this.options.bins ?? Math.max(1, Math.ceil(Math.sqrt(values.length)));
    if (!Number.isSafeInteger(count) || count <= 0)
      throw new RangeError("FacetViz: histogram bins must be a positive integer");
    let width = (max - min) / count || 1, bins = Array.from({ length: count }, (_, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count: 0 }));
    for (let v of values) {
      let idx = Math.min(count - 1, Math.floor((v - min) / width));
      bins[idx].count++;
    }
    return bins;
  }
  render(ctx) {
    let { renderer, xScale, yScale } = ctx, g = renderer.group({ class: `facet-series facet-histogram ${this.name}` }, renderer.root), zeroY = yScale.scale(0);
    this.points.forEach((p) => {
      let b = { x0: p.options.x0, x1: p.options.x1 }, xa = xScale.scale(b.x0), xb = xScale.scale(b.x1), yTop = yScale.scale(p.y ?? 0), el = renderer.create("rect", {
        x: Math.min(xa, xb) + 0.5,
        y: yTop,
        width: Math.max(1, Math.abs(xb - xa) - 1),
        height: Math.max(0, zeroY - yTop),
        fill: p.color ?? this.color,
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
};

// src/entries/series/histogram.ts
var registerHistogramSeries = () => registerSeriesType("histogram", HistogramSeries);
registerHistogramSeries();

// src/entries/series/line.ts
var registerLineSeries = () => registerSeriesTypes(["line", "spline", "step"], LineSeries);
registerLineSeries();

// src/series/lollipop.ts
var LollipopSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    return [0, p.y];
  }
  render(ctx) {
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, g = renderer.group(
      { class: `facet-series facet-lollipop ${this.name}` },
      renderer.root
    ), band = catScale.bandwidth ? catScale.bandwidth() : 0, subWidth = band / groupCount, marker = this.options.marker ?? {}, radius = marker.radius ?? 5, stemWidth = this.options.lineWidth ?? this.options.size ?? 2;
    for (let p of this.points) {
      if (p.y === void 0) continue;
      let color = p.color ?? this.color, cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, vBase = valScale.scale(0), vEnd = valScale.scale(p.y), stem = inverted ? { x1: vBase, y1: cat, x2: vEnd, y2: cat } : { x1: cat, y1: vBase, x2: cat, y2: vEnd };
      renderer.create(
        "line",
        {
          ...stem,
          stroke: alpha(color, 0.55),
          "stroke-width": stemWidth,
          "stroke-linecap": "round"
        },
        g
      );
      let cx = inverted ? vEnd : cat, cy = inverted ? cat : vEnd, el = marker.enabled === !1 ? renderer.create("circle", {
        cx,
        cy,
        r: Math.max(8, radius),
        fill: "transparent",
        "pointer-events": "all",
        class: "facet-point-hit"
      }, g) : drawMarker(renderer, g, cx, cy, {
        symbol: marker.symbol ?? "circle",
        radius,
        fill: marker.fillColor ?? color,
        stroke: marker.lineColor ?? "#fff",
        strokeWidth: marker.lineWidth ?? 1.5,
        width: marker.width,
        height: marker.height
      });
      ctx.registerHover(el, p), el.addEventListener(
        "click",
        (e) => ctx.onPointEvent("click", p, e)
      ), el.addEventListener(
        "mouseover",
        (e) => ctx.onPointEvent("mouseOver", p, e)
      ), el.addEventListener(
        "mouseout",
        (e) => ctx.onPointEvent("mouseOut", p, e)
      ), this.drawLabel(ctx, p, cx, cy, radius, inverted);
    }
  }
  drawLabel(ctx, p, cx, cy, radius, inverted) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color
    }), d = dl.distance ?? 0, gap = radius + 6 + d, negative = (p.y ?? 0) < 0, place;
    inverted ? place = negative ? { x: cx - gap, y: cy + 4, anchor: "end" } : { x: cx + gap, y: cy + 4, anchor: "start" } : place = negative ? { x: cx, y: cy + gap + 8, anchor: "middle" } : { x: cx, y: cy - gap, anchor: "middle" }, drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
};

// src/entries/series/lollipop.ts
var registerLollipopSeries = () => registerSeriesType("lollipop", LollipopSeries);
registerLollipopSeries();

// src/series/marimekko.ts
var MarimekkoSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  // Drawn by the chart-level marimekko renderer.
  render(_ctx) {
  }
};

// src/entries/series/marimekko.ts
var registerMarimekkoSeries = () => registerSeriesType("marimekko", MarimekkoSeries);
registerMarimekkoSeries();

// src/series/pie.ts
var PieSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1, pointLegend: !0 };
  }
  dims() {
    let d = this.options.dimensions;
    return Array.isArray(d) && d.length >= 2 ? d : void 0;
  }
  /** Distinct first-dimension groups (encounter order) for multi-level pies. */
  groups() {
    let dims = this.dims();
    if (!dims) return [];
    let seen = [];
    for (let p of this.points) {
      let k = String(p.options[dims[0]] ?? "");
      seen.includes(k) || seen.push(k);
    }
    return seen;
  }
  innerRatio() {
    return this.type === "donut" ? this.parsePercent(this.options.innerSize ?? "60%") : this.options.innerSize ? this.parsePercent(this.options.innerSize) : 0;
  }
  parsePercent(v) {
    let n = parseFloat(v);
    return Number.isNaN(n) ? 0 : Math.min(0.95, Math.max(0, n / 100));
  }
  render(ctx) {
    let { renderer, plot } = ctx, g = renderer.group({ class: `facet-series facet-pie ${this.name}` }, renderer.root), dl = this.options.dataLabels, labelsEnabled = !!dl?.enabled, labelMode = dl?.position === "outside" ? "outside" : "adaptive", margin = labelsEnabled ? 48 : 6, c = {
      cx: plot.x + plot.width / 2,
      cy: plot.y + plot.height / 2,
      radius: Math.max(10, Math.min(plot.width, plot.height) / 2 - margin),
      margin,
      labelMode
    };
    if (this.dims()) {
      this.renderMultiLevel(ctx, g, c);
      return;
    }
    let layout = { lastY: {} }, innerR = c.radius * this.innerRatio(), centerValue = this.drawCenterValue(ctx, g, c, innerR), points = this.visiblePoints(), total = sum(points.map((p) => p.y ?? 0));
    if (total <= 0) return;
    let zs = points.map((p) => p.options.z).filter((z) => typeof z == "number"), variable = zs.length > 0, zMin = variable ? Math.min(...zs) : 0, zMax = variable ? Math.max(...zs) : 1, minR = innerR + (c.radius - innerR) * 0.45, radiusFor = (p) => {
      let z = p.options.z;
      return !variable || typeof z != "number" ? c.radius : minR + (c.radius - minR) * (zMax === zMin ? 1 : (z - zMin) / (zMax - zMin));
    }, angle = -Math.PI / 2;
    points.forEach((p) => {
      let value = p.y ?? 0;
      if (value <= 0) return;
      let sweep = value / total * Math.PI * 2, end = angle + sweep, color = p.color ?? paletteColor(ctx.colors, this.points.indexOf(p)), rr = radiusFor(p), path = this.slicePath(c.cx, c.cy, rr, innerR, angle, end), el = renderer.create("path", { d: path, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      ctx.registerHover(el, p), this.bindCenterValue(el, p, centerValue, total, color), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      let label = this.labelText(p, p.name ?? p.x, value, total);
      this.drawLabel(ctx, g, c, rr, innerR, angle, end, label, color, layout), angle = end;
    });
  }
  /** Two-dimension pie: inner ring = first field, outer ring = second field. */
  renderMultiLevel(ctx, g, c) {
    let dims = this.dims(), { renderer } = ctx, holeR = c.radius * this.innerRatio(), midR = holeR + (c.radius - holeR) * 0.55, centerValue = this.drawCenterValue(ctx, g, c, holeR), order = this.groups(), buckets = /* @__PURE__ */ new Map();
    for (let g0 of order) buckets.set(g0, []);
    for (let p of this.visiblePoints()) {
      let k = String(p.options[dims[0]] ?? "");
      buckets.get(k)?.push(p);
    }
    let groupTotal = (ps) => sum(ps.map((p) => p.y ?? 0)), total = sum([...buckets.values()].map(groupTotal));
    if (total <= 0) return;
    let layout = { lastY: {} }, angle = -Math.PI / 2;
    order.forEach((g0, gi) => {
      let ps = buckets.get(g0) ?? [], gVal = groupTotal(ps);
      if (gVal <= 0) return;
      let sweep = gVal / total * Math.PI * 2, end = angle + sweep, base = paletteColor(ctx.colors, gi), innerPath = this.slicePath(c.cx, c.cy, midR, holeR, angle, end);
      renderer.create("path", { d: innerPath, fill: base, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      let innerLabelR = (holeR + midR) / 2, mid = (angle + end) / 2, chord = 2 * innerLabelR * Math.sin(Math.min(Math.PI, sweep) / 2), bandThickness = midR - holeR, fitted = this.fitText(g0, Math.max(chord, bandThickness) - 4, 6.8);
      fitted && renderer.text(fitted, c.cx + innerLabelR * Math.cos(mid), c.cy + innerLabelR * Math.sin(mid), {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: "#ffffff",
        "font-weight": "600"
      }, g);
      let a2 = angle;
      ps.forEach((p, j) => {
        let value = p.y ?? 0;
        if (value <= 0) return;
        let cs = value / gVal * sweep, e2 = a2 + cs, color = p.color ?? shade(base, 0.12 + 0.5 * (ps.length === 1 ? 0 : j / (ps.length - 1))), outerPath = this.slicePath(c.cx, c.cy, c.radius, midR, a2, e2), el = renderer.create("path", { d: outerPath, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
        ctx.registerHover(el, p), this.bindCenterValue(el, p, centerValue, total, color), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
        let name = String(p.options[dims[1]] ?? p.name ?? p.x), label = this.labelText(p, name, value, total);
        this.drawLabel(ctx, g, c, c.radius, midR, a2, e2, label, color, layout), a2 = e2;
      }), angle = end;
    });
  }
  // -- Legend (multi-level lists the inner-dimension groups) --------------
  legendItems(colors) {
    let dims = this.dims();
    if (dims)
      return this.groups().map((g0, i) => ({
        label: g0,
        color: paletteColor(colors, i),
        visible: this.points.some((p) => String(p.options[dims[0]] ?? "") === g0 && !this.hiddenPoints.has(p.index))
      }));
  }
  onLegendToggle(index) {
    let dims = this.dims();
    if (!dims) return;
    let g0 = this.groups()[index], pts = this.points.filter((p) => String(p.options[dims[0]] ?? "") === g0), anyVisible = pts.some((p) => !this.hiddenPoints.has(p.index));
    for (let p of pts)
      anyVisible ? this.hiddenPoints.add(p.index) : this.hiddenPoints.delete(p.index);
  }
  /**
   * Truncate `text` with an ellipsis to fit `availablePx`. Returns '' when even
   * a single character won't fit (label omitted entirely).
   */
  fitText(text, availablePx, charW) {
    let maxChars = Math.floor(availablePx / charW);
    return maxChars < 1 ? "" : text.length <= maxChars ? text : maxChars === 1 ? text.slice(0, 1) : text.slice(0, maxChars - 1) + "\u2026";
  }
  /** Draw the initially-empty value readout used by charts with a centre hole. */
  drawCenterValue(ctx, g, c, innerR) {
    let options = this.options.centerLabel;
    if (!(innerR <= 0 || options?.enabled === !1))
      return ctx.renderer.text("", c.cx, c.cy, {
        class: "facet-donut-center-value",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "pointer-events": "none",
        "aria-hidden": "true",
        ...FONTS.dataLabel,
        fill: options?.color ?? FONTS.dataLabel.fill,
        "font-size": options?.fontSize ?? `${Math.max(12, Math.min(24, innerR * 0.38))}px`,
        "font-weight": options?.fontWeight ?? "600",
        "font-family": options?.fontFamily
      }, g);
  }
  /** Keep the centre readout in sync with pointer and keyboard hover state. */
  bindCenterValue(el, p, centerValue, total, color) {
    if (!centerValue) return;
    let show = () => {
      let value = p.y ?? 0, context = {
        x: p.x,
        y: value,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color,
        percentage: total ? value / total * 100 : 0,
        total
      }, options = this.options.centerLabel;
      centerValue.textContent = options?.formatter ? options.formatter(context) : options?.format ? formatString(options.format, { ...context }) : formatNumber(value, {
        decimals: this.options.tooltip?.valueDecimals,
        prefix: this.options.tooltip?.valuePrefix,
        suffix: this.options.tooltip?.valueSuffix
      });
    }, hide = () => {
      centerValue.textContent = "";
    };
    el.addEventListener("mouseenter", show), el.addEventListener("mouseleave", hide), el.addEventListener("focus", show), el.addEventListener("blur", hide);
  }
  /** Build the label string for a slice from the series' dataLabels config. */
  labelText(p, name, value, total) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return "";
    let percentage = total ? value / total * 100 : 0, label = name ?? "";
    return dl.formatter ? dl.formatter({ x: p.x, y: value, point: p.options, series: this.name, name: label, index: p.index, color: p.color, percentage, total }) : formatString(dl.format ?? "{name}: {percentage:.1f}%", {
      name: label,
      x: p.x,
      y: value,
      percentage,
      total,
      series: this.name,
      index: p.index,
      color: p.color,
      point: p.options
    });
  }
  /**
   * Draw a slice label. Labels prefer the middle of the sector and fall back
   * beyond the rim when their rendered bounds do not fit. An explicit
   * `position: 'outside'` skips the inside candidate. Outside labels are joined
   * to the slice with a leader line (elbow + stub) so it is unambiguous which
   * label belongs to which slice.
   *
   * A shrunk pie packs slices (and their labels) closer together. An outside
   * label that would collide with the previous one on its side is skipped,
   * leaving the rest legible.
   */
  drawLabel(ctx, g, c, rimR, innerR, a0, a1, text, sliceColor, layout) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled || !text) return;
    let { renderer } = ctx, mid = (a0 + a1) / 2, fontPx = parseFloat(dataLabelFontSize(dl)) || 11;
    if (c.labelMode === "adaptive") {
      let inside = this.insideLabelPoint(ctx, c, innerR, rimR, a0, a1, text);
      if (inside) {
        drawDataLabel(
          renderer,
          g,
          text,
          {
            x: inside.x,
            y: inside.y + fontPx * 0.35,
            anchor: "middle"
          },
          { ...dl, color: dl.color ?? "#ffffff" }
        );
        return;
      }
    }
    let dir = Math.cos(mid) >= 0 ? 1 : -1, side = dir > 0 ? "right" : "left", rimX = c.cx + rimR * Math.cos(mid), rimY = c.cy + rimR * Math.sin(mid), elbowR = rimR + 10 + (dl.distance ?? 0), elbowX = c.cx + elbowR * Math.cos(mid), elbowY = c.cy + elbowR * Math.sin(mid), stubX = elbowX + dir * 16, lastY = layout.lastY[side];
    lastY !== void 0 && Math.abs(elbowY - lastY) < fontPx + 3 || (layout.lastY[side] = elbowY, renderer.create("polyline", {
      points: `${rimX},${rimY} ${elbowX},${elbowY} ${stubX},${elbowY}`,
      fill: "none",
      stroke: dl.color ?? sliceColor,
      "stroke-width": 1
    }, g), drawDataLabel(
      renderer,
      g,
      text,
      {
        x: stubX + dir * 4,
        y: elbowY + fontPx * 0.35,
        anchor: dir > 0 ? "start" : "end"
      },
      dl
    ));
  }
  /**
   * Return an inside label centre only when the complete (possibly rotated)
   * text rectangle fits between both radii and both angular edges.
   */
  insideLabelPoint(ctx, c, innerR, rimR, a0, a1, text) {
    let dl = this.options.dataLabels, fontSize = dataLabelFontSize(dl), metrics = ctx.renderer.measureText(text, {
      ...FONTS.dataLabel,
      "font-size": fontSize,
      "font-weight": dl.fontWeight
    }), width = Math.max(
      metrics.width,
      dl.backgroundColor ? text.length * 6.5 + 8 : 0
    ) + 6, height = Math.max(metrics.height, dl.backgroundColor ? 15 : 0) + 4, mid = (a0 + a1) / 2, rotation = (dl.rotation ?? 0) * Math.PI / 180, cos = Math.cos(rotation), sin = Math.sin(rotation), halfSweep = (a1 - a0) / 2, ratios = [innerR === 0 ? 0.68 : 0.5, 0.6, 0.75, 0.5, 0.4];
    for (let ratio of [...new Set(ratios)]) {
      let labelR = innerR + (rimR - innerR) * ratio + (dl.distance ?? 0), x = c.cx + labelR * Math.cos(mid), y = c.cy + labelR * Math.sin(mid), centreLocalX = -labelR * Math.cos(mid - rotation), centreLocalY = -labelR * Math.sin(mid - rotation), nearestX = Math.max(Math.abs(centreLocalX) - width / 2, 0), nearestY = Math.max(Math.abs(centreLocalY) - height / 2, 0);
      if (Math.hypot(nearestX, nearestY) < innerR + 2) continue;
      let fits = !0;
      for (let dx of [-width / 2, width / 2])
        for (let dy of [-height / 2, height / 2]) {
          let px = x + dx * cos - dy * sin - c.cx, py = y + dx * sin + dy * cos - c.cy;
          if (Math.hypot(px, py) > rimR - 2 && (fits = !1), halfSweep < Math.PI) {
            let angle = Math.atan2(py, px), delta = Math.atan2(Math.sin(angle - mid), Math.cos(angle - mid));
            Math.abs(delta) > halfSweep && (fits = !1);
          }
        }
      if (fits) return { x, y };
    }
  }
  slicePath(cx, cy, r, ir, a0, a1) {
    if (a1 - a0 >= Math.PI * 2 - 1e-10) {
      let am = a0 + Math.PI, x02 = cx + r * Math.cos(a0), y02 = cy + r * Math.sin(a0), xm = cx + r * Math.cos(am), ym = cy + r * Math.sin(am);
      if (ir <= 0)
        return `M ${cx} ${cy} L ${x02} ${y02} A ${r} ${r} 0 1 1 ${xm} ${ym} A ${r} ${r} 0 1 1 ${x02} ${y02} Z`;
      let ix02 = cx + ir * Math.cos(a0), iy02 = cy + ir * Math.sin(a0), ixm = cx + ir * Math.cos(am), iym = cy + ir * Math.sin(am);
      return `M ${x02} ${y02} A ${r} ${r} 0 1 1 ${xm} ${ym} A ${r} ${r} 0 1 1 ${x02} ${y02} L ${ix02} ${iy02} A ${ir} ${ir} 0 1 0 ${ixm} ${iym} A ${ir} ${ir} 0 1 0 ${ix02} ${iy02} Z`;
    }
    let large = a1 - a0 > Math.PI ? 1 : 0, x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    if (ir <= 0)
      return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    let ix0 = cx + ir * Math.cos(a1), iy0 = cy + ir * Math.sin(a1), ix1 = cx + ir * Math.cos(a0), iy1 = cy + ir * Math.sin(a0);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix0} ${iy0} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`;
  }
};

// src/entries/series/pie.ts
var registerPieSeries = () => registerSeriesTypes(["pie", "donut"], PieSeries);
registerPieSeries();

// src/series/radar.ts
var RadarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  // Drawn by the chart-level radar renderer.
  render(_ctx) {
  }
};

// src/entries/series/radar.ts
var registerRadarSeries = () => registerSeriesType("radar", RadarSeries);
registerRadarSeries();

// src/series/radialbar.ts
var RadialBarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !0, pointLegend: !0 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-radialbar ${this.name}` }, renderer.root), cx = plot.x + plot.width / 2, cy = plot.y + plot.height / 2, outer = Math.min(plot.width, plot.height) / 2 - 4, points = this.visiblePoints(), stacked = !!this.options.stacking, categories = stacked && ctx.radialCategories?.length ? ctx.radialCategories : points.map((point) => point.x), categoryIndex = new Map(
      categories.map((category, index) => [
        `${typeof category}:${String(category)}`,
        index
      ])
    ), max = stacked ? ctx.radialValueMax ?? Math.max(1, ...points.map((p) => p.stackHigh ?? p.y ?? 0)) : Math.max(1, ...points.map((p) => p.y ?? 0)), n = categories.length || 1, ringWidth = outer * 0.7 / n, gap = ringWidth * 0.25, startAngleDegrees = this.options.startAngle ?? -90, endAngleDegrees = this.options.endAngle ?? 180, sweepDegrees = endAngleDegrees - startAngleDegrees;
    if (!Number.isFinite(startAngleDegrees) || !Number.isFinite(endAngleDegrees) || sweepDegrees <= 0 || sweepDegrees > 360)
      throw new RangeError(
        "FacetViz: radialbar startAngle/endAngle must define a positive sweep of at most 360 degrees"
      );
    let startAngle = startAngleDegrees * Math.PI / 180, fullSweep = sweepDegrees * Math.PI / 180, labelX = cx - 8, ringGeometry = (index) => {
      let rOuter = outer - index * ringWidth;
      return {
        rOuter,
        rInner: rOuter - (ringWidth - gap)
      };
    }, drawTrack = (index, label, color) => {
      let { rInner, rOuter } = ringGeometry(index);
      renderer.create("path", {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep),
        fill: alpha(color, 0.15),
        stroke: "none",
        class: "facet-radialbar-track"
      }, g), !ctx.suppressDataLabels && renderer.text(label, labelX, cy - (rInner + rOuter) / 2 + 4, {
        "text-anchor": "end",
        ...FONTS.dataLabel,
        "font-size": scaledFontPx(10),
        class: "facet-radialbar-label"
      }, g);
    };
    if (stacked && ctx.radialSeriesIndex === 0) {
      let labels = new Map(
        points.map((point) => [
          `${typeof point.x}:${String(point.x)}`,
          String(point.name ?? point.x)
        ])
      );
      categories.forEach((category, index) => {
        let key = `${typeof category}:${String(category)}`;
        drawTrack(index, labels.get(key) ?? String(category), this.color);
      });
    }
    points.forEach((p, pointIndex) => {
      let value = p.y ?? 0, index = stacked ? categoryIndex.get(`${typeof p.x}:${String(p.x)}`) ?? pointIndex : pointIndex, { rInner, rOuter } = ringGeometry(index), color = p.color ?? (stacked ? this.color : paletteColor(colors, this.points.indexOf(p))), low = stacked ? p.stackLow ?? 0 : 0, high = stacked ? p.stackHigh ?? value : value, startFraction = Math.max(0, Math.min(1, low / max)), endFraction = Math.max(0, Math.min(1, high / max));
      stacked || drawTrack(index, String(p.name ?? p.x), color);
      let el = renderer.create("path", {
        d: this.arcBand(
          cx,
          cy,
          rInner,
          rOuter,
          startAngle + fullSweep * startFraction,
          startAngle + fullSweep * endFraction
        ),
        fill: color,
        stroke: "none",
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
  /** A filled band between two radii swept between two angles. */
  arcBand(cx, cy, ri, ro, a0, a1) {
    if (a1 <= a0 + 1e-4) return "";
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
      let mid = a0 + Math.PI, ox02 = cx + ro * Math.cos(a0), oy02 = cy + ro * Math.sin(a0), oxm = cx + ro * Math.cos(mid), oym = cy + ro * Math.sin(mid), ix02 = cx + ri * Math.cos(a0), iy02 = cy + ri * Math.sin(a0), ixm = cx + ri * Math.cos(mid), iym = cy + ri * Math.sin(mid);
      return `M ${ox02} ${oy02} A ${ro} ${ro} 0 0 1 ${oxm} ${oym} A ${ro} ${ro} 0 0 1 ${ox02} ${oy02} L ${ix02} ${iy02} A ${ri} ${ri} 0 0 0 ${ixm} ${iym} A ${ri} ${ri} 0 0 0 ${ix02} ${iy02} Z`;
    }
    let large = a1 - a0 > Math.PI ? 1 : 0, ox0 = cx + ro * Math.cos(a0), oy0 = cy + ro * Math.sin(a0), ox1 = cx + ro * Math.cos(a1), oy1 = cy + ro * Math.sin(a1), ix1 = cx + ri * Math.cos(a1), iy1 = cy + ri * Math.sin(a1), ix0 = cx + ri * Math.cos(a0), iy0 = cy + ri * Math.sin(a0);
    return `M ${ox0} ${oy0} A ${ro} ${ro} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${ri} ${ri} 0 ${large} 0 ${ix0} ${iy0} Z`;
  }
};

// src/entries/series/radialbar.ts
var registerRadialBarSeries = () => registerSeriesType("radialbar", RadialBarSeries);
registerRadialBarSeries();

// src/series/range.ts
var RangeSeries = class extends BaseSeries {
  smooth() {
    return this.type === "areasplinerange";
  }
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    let { renderer, xScale, yScale } = ctx, g = renderer.group({ class: `facet-series facet-arearange ${this.name}` }, renderer.root), top = [], bottom = [], drawn = [];
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let x = xScale.scale(p.x);
      top.push({ x, y: yScale.scale(p.high) }), bottom.push({ x, y: yScale.scale(p.low) }), drawn.push(p);
    }
    if (!top.length) return;
    let line = this.smooth() ? splinePath : linePath, topD = line(top), bottomD = line([...bottom].reverse()).replace(/^M/, "L");
    renderer.create("path", {
      d: `${topD} ${bottomD} Z`,
      fill: alpha(this.color, this.options.fillOpacity ?? 0.35),
      stroke: "none"
    }, g), renderer.create("path", { d: topD, fill: "none", stroke: this.color, "stroke-width": this.options.lineWidth ?? 2 }, g), renderer.create("path", { d: line(bottom), fill: "none", stroke: this.color, "stroke-width": this.options.lineWidth ?? 2 }, g);
    let marker = this.options.marker, visible = marker?.enabled !== !1;
    drawn.forEach((p, i) => {
      for (let pt of [top[i], bottom[i]]) {
        let el = visible ? drawMarker(renderer, g, pt.x, pt.y, {
          symbol: marker?.symbol ?? "circle",
          radius: marker?.radius ?? 3.5,
          fill: marker?.fillColor ?? this.color,
          stroke: marker?.lineColor ?? "#fff",
          strokeWidth: marker?.lineWidth ?? 1,
          width: marker?.width,
          height: marker?.height
        }) : renderer.create("circle", {
          cx: pt.x,
          cy: pt.y,
          r: 8,
          fill: "transparent",
          "pointer-events": "all",
          class: "facet-point-hit"
        }, g);
        ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      }
    });
  }
};

// src/entries/series/range.ts
var registerRangeSeries = () => registerSeriesTypes(["arearange", "areasplinerange"], RangeSeries);
registerRangeSeries();

// src/series/sankey.ts
var SankeySeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-sankey ${this.name}` }, renderer.root), links = this.points.map((p) => ({ from: String(p.options.from ?? ""), to: String(p.options.to ?? ""), weight: p.options.weight ?? p.y ?? 1, point: p })).filter((l) => l.from && l.to && Number.isFinite(l.weight) && l.weight > 0);
    if (!links.length) return;
    let nodes = /* @__PURE__ */ new Map(), node = (id) => nodes.get(id) ?? nodes.set(id, { id, depth: 0, inflow: 0, outflow: 0, x: 0, y: 0, h: 0, color: "" }).get(id);
    for (let l of links)
      node(l.from).outflow += l.weight, node(l.to).inflow += l.weight;
    let incoming = /* @__PURE__ */ new Map(), outgoing = /* @__PURE__ */ new Map();
    for (let id of nodes.keys()) incoming.set(id, 0);
    for (let l of links) {
      incoming.set(l.to, (incoming.get(l.to) ?? 0) + 1);
      let list = outgoing.get(l.from) ?? [];
      list.push(l), outgoing.set(l.from, list);
    }
    let queue = [...nodes.keys()].filter((id) => incoming.get(id) === 0), visited = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      let id = queue[qi];
      visited++;
      let source = node(id);
      for (let l of outgoing.get(id) ?? []) {
        let target = node(l.to);
        target.depth = Math.max(target.depth, source.depth + 1);
        let next = (incoming.get(l.to) ?? 1) - 1;
        incoming.set(l.to, next), next === 0 && queue.push(l.to);
      }
    }
    if (visited !== nodes.size)
      throw new Error("FacetViz: sankey links must form an acyclic graph");
    let maxDepth = Math.max(...[...nodes.values()].map((n) => n.depth)), nodeW = 14, vGap = 8, colWidth = maxDepth > 0 ? (plot.width - nodeW - 16) / maxDepth : 0, columns = Array.from({ length: maxDepth + 1 }, () => []), ci = 0;
    for (let n of nodes.values())
      columns[n.depth].push(n), n.color = paletteColor(colors, ci++);
    let colValue = (col) => col.reduce((s, n) => s + Math.max(n.inflow, n.outflow), 0), maxColVal = Math.max(1, ...columns.map(colValue)), maxColCount = Math.max(1, ...columns.map((c) => c.length)), unit = (plot.height - vGap * (maxColCount - 1)) / maxColVal;
    for (let col of columns) {
      let colH = col.reduce((s, n) => s + Math.max(n.inflow, n.outflow) * unit, 0) + vGap * (col.length - 1), y = plot.y + (plot.height - colH) / 2;
      for (let n of col)
        n.h = Math.max(2, Math.max(n.inflow, n.outflow) * unit), n.x = plot.x + n.depth * colWidth, n.y = y, y += n.h + vGap;
    }
    let outOff = /* @__PURE__ */ new Map(), inOff = /* @__PURE__ */ new Map();
    for (let l of links) {
      let s = node(l.from), t = node(l.to), th = Math.max(1, l.weight * unit), so = outOff.get(s.id) ?? 0, to = inOff.get(t.id) ?? 0, y1 = s.y + so + th / 2, y2 = t.y + to + th / 2, x1 = s.x + nodeW, x2 = t.x, mx = (x1 + x2) / 2, path = renderer.create("path", {
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        fill: "none",
        stroke: alpha(s.color, 0.4),
        "stroke-width": th,
        class: "facet-point"
      }, g);
      ctx.registerHover(path, l.point), path.addEventListener("click", (e) => ctx.onPointEvent("click", l.point, e)), path.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", l.point, e)), path.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", l.point, e)), outOff.set(s.id, so + th), inOff.set(t.id, to + th);
    }
    for (let n of nodes.values()) {
      renderer.create("rect", { x: n.x, y: n.y, width: nodeW, height: n.h, fill: n.color, rx: 2 }, g);
      let leftSide = n.depth < maxDepth / 2;
      renderer.text(n.id, leftSide ? n.x + nodeW + 4 : n.x - 4, n.y + n.h / 2, {
        "text-anchor": leftSide ? "start" : "end",
        "dominant-baseline": "middle",
        ...FONTS.axisLabel
      }, g);
    }
  }
};

// src/entries/series/sankey.ts
var registerSankeySeries = () => registerSeriesType("sankey", SankeySeries);
registerSankeySeries();

// src/core/scale.ts
var LinearScale = class {
  constructor(cfg) {
    [this.d0, this.d1] = cfg.domain, [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range, this.format = cfg.format, this.tickValues = cfg.ticks ?? niceTicks(this.d0, this.d1, cfg.tickCount ?? 4);
    let niceByDefault = cfg.nice !== !1, niceMin = cfg.niceMin ?? niceByDefault, niceMax = cfg.niceMax ?? niceByDefault;
    if (this.tickValues.length) {
      let firstTick = this.tickValues[0], lastTick = this.tickValues[this.tickValues.length - 1];
      niceMin ? this.d0 = Math.min(this.d0, firstTick) : this.tickValues = this.tickValues.filter((v) => v >= this.d0), niceMax ? this.d1 = Math.max(this.d1, lastTick) : this.tickValues = this.tickValues.filter((v) => v <= this.d1), !niceMin && !this.tickValues.includes(this.d0) && this.tickValues.unshift(this.d0), !niceMax && !this.tickValues.includes(this.d1) && this.tickValues.push(this.d1);
    }
  }
  scale(value) {
    let v = typeof value == "number" ? value : parseFloat(value), t = this.d1 === this.d0 ? 0 : (v - this.d0) / (this.d1 - this.d0);
    return this.r0 + t * (this.r1 - this.r0);
  }
  invert(pixel) {
    let t = this.r1 === this.r0 ? 0 : (pixel - this.r0) / (this.r1 - this.r0);
    return this.d0 + t * (this.d1 - this.d0);
  }
  ticks() {
    return this.tickValues;
  }
  tickLabel(value) {
    let v = typeof value == "number" ? value : parseFloat(value);
    return this.format ? this.format(v) : String(v);
  }
  bandwidth() {
    return 0;
  }
  range() {
    return [this.r0, this.r1];
  }
  get domain() {
    return [this.d0, this.d1];
  }
}, LogScale = class {
  constructor(cfg) {
    let lo = Math.max(cfg.domain[0], 1e-9), hi = Math.max(cfg.domain[1], lo * 10);
    this.l0 = Math.log10(lo), this.l1 = Math.log10(hi), [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range, this.format = cfg.format;
  }
  scale(value) {
    let v = Math.max(typeof value == "number" ? value : parseFloat(value), 1e-9), t = (Math.log10(v) - this.l0) / (this.l1 - this.l0);
    return this.r0 + t * (this.r1 - this.r0);
  }
  invert(pixel) {
    let t = this.r1 === this.r0 ? 0 : (pixel - this.r0) / (this.r1 - this.r0);
    return Math.pow(10, this.l0 + t * (this.l1 - this.l0));
  }
  ticks() {
    let ticks = [];
    for (let e = Math.ceil(this.l0); e <= Math.floor(this.l1); e++)
      ticks.push(Math.pow(10, e));
    return ticks.length ? ticks : [Math.pow(10, this.l0), Math.pow(10, this.l1)];
  }
  tickLabel(value) {
    let v = typeof value == "number" ? value : parseFloat(value);
    return this.format ? this.format(v) : String(v);
  }
  bandwidth() {
    return 0;
  }
  range() {
    return [this.r0, this.r1];
  }
}, CategoryScale = class {
  constructor(cfg) {
    this.index = /* @__PURE__ */ new Map();
    this.categories = cfg.reversed ? [...cfg.categories].reverse() : cfg.categories, this.categories.forEach((c, i) => this.index.set(String(c), i)), [this.r0, this.r1] = cfg.range, this.pad = cfg.padding ?? 0.2, this.step = (this.r1 - this.r0) / Math.max(1, this.categories.length), this.format = cfg.format;
  }
  /** Returns the centre pixel of a category's band. */
  scale(value) {
    let i = this.index.get(String(value)), idx = i === void 0 ? Number(value) : i;
    return this.r0 + this.step * (idx + 0.5);
  }
  ticks() {
    return this.categories;
  }
  tickLabel(value) {
    return this.format ? this.format(value) : String(value);
  }
  /** Usable width for a bar within a band (excludes padding). */
  bandwidth() {
    return Math.abs(this.step) * (1 - this.pad);
  }
  /** Full step including padding — used to position grouped bars. */
  fullStep() {
    return this.step;
  }
  range() {
    return [this.r0, this.r1];
  }
};

// src/series/scatter.ts
var ScatterSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  get isJitter() {
    return this.type === "jitter";
  }
  render(ctx) {
    let { renderer } = ctx, g = renderer.group(
      { class: `facet-series facet-scatter ${this.name}` },
      renderer.root
    ), catScale = ctx.polar ? ctx.xScale : ctx.inverted ? ctx.yScale : ctx.xScale, valScale = ctx.polar ? ctx.yScale : ctx.inverted ? ctx.xScale : ctx.yScale, marker = this.options.marker ?? {}, rng = seededRandom(this.index * 7919 + this.points.length + 1), band = catScale instanceof CategoryScale ? catScale.bandwidth() : 0, spread = (this.options.jitter ?? 0.5) * band, labelData = [];
    for (let p of this.points) {
      if (p.y === void 0) continue;
      let catPx = catScale.scale(p.x);
      this.isJitter && band > 0 && (catPx += (rng() - 0.5) * spread);
      let valPx = valScale.scale(p.y), projected = ctx.polar ? projectPolar(
        ctx.plot,
        ctx.inverted ? valPx : catPx,
        ctx.inverted ? catPx : valPx
      ) : void 0, x = projected?.x ?? (ctx.inverted ? valPx : catPx), y = projected?.y ?? (ctx.inverted ? catPx : valPx);
      labelData.push({ pt: { x, y }, p });
      let radius = p.options.radius ?? this.options.radius ?? this.options.size ?? marker.radius ?? 5, el = marker.enabled === !1 ? renderer.create(
        "circle",
        {
          cx: x,
          cy: y,
          r: Math.max(8, radius),
          fill: "transparent",
          "pointer-events": "all",
          class: "facet-point-hit"
        },
        g
      ) : drawMarker(renderer, g, x, y, {
        symbol: marker.symbol ?? "circle",
        radius,
        fill: p.color ?? marker.fillColor ?? this.color,
        stroke: marker.lineColor ?? "#ffffff",
        strokeWidth: marker.lineWidth ?? 1,
        width: marker.width,
        height: marker.height
      });
      ctx.registerHover(el, p), el.addEventListener(
        "click",
        (e) => ctx.onPointEvent("click", p, e)
      ), el.addEventListener(
        "mouseover",
        (e) => ctx.onPointEvent("mouseOver", p, e)
      ), el.addEventListener(
        "mouseout",
        (e) => ctx.onPointEvent("mouseOut", p, e)
      );
    }
    drawPointLabels(
      renderer,
      g,
      this.options.dataLabels,
      this.name,
      labelData,
      this.color
    );
  }
};

// src/entries/series/scatter.ts
var registerScatterSeries = () => registerSeriesTypes(["scatter", "jitter"], ScatterSeries);
registerScatterSeries();

// src/series/slope.ts
var SlopeSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  render(ctx) {
    let { renderer } = ctx, g = renderer.group(
      { class: `facet-series facet-slope ${this.name}` },
      renderer.root
    ), data = [];
    for (let p of this.points)
      p.y !== void 0 && data.push({ pt: { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(p.y) }, p });
    if (!data.length) return;
    renderer.create(
      "path",
      {
        d: linePath(data.map((d) => d.pt)),
        fill: "none",
        stroke: this.color,
        "stroke-width": this.options.lineWidth ?? this.options.size ?? 2.5,
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      },
      g
    );
    let marker = this.options.marker ?? {}, radius = marker.radius ?? 4.5;
    data.forEach(({ pt, p }, i) => {
      let color = p.color ?? this.color, el = marker.enabled === !1 ? renderer.create("circle", {
        cx: pt.x,
        cy: pt.y,
        r: Math.max(8, radius),
        fill: "transparent",
        "pointer-events": "all",
        class: "facet-point-hit"
      }, g) : drawMarker(renderer, g, pt.x, pt.y, {
        symbol: marker.symbol ?? "circle",
        radius,
        fill: marker.fillColor ?? color,
        stroke: marker.lineColor ?? "#fff",
        strokeWidth: marker.lineWidth ?? 1.5,
        width: marker.width,
        height: marker.height
      });
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener(
        "mouseover",
        (e) => ctx.onPointEvent("mouseOver", p, e)
      ), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e)), this.drawLabel(ctx, p, pt, radius, i === 0, i === data.length - 1);
    });
  }
  /** The value at each end (first point labelled to its left, last to its right). */
  drawLabel(ctx, p, pt, radius, isFirst, isLast) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled || !(isFirst || isLast)) return;
    let text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color
    }), d = dl.distance ?? 0, gap = radius + 6 + d, place = isLast ? { x: pt.x + gap, y: pt.y + 4, anchor: "start" } : { x: pt.x - gap, y: pt.y + 4, anchor: "end" };
    drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
};

// src/entries/series/slope.ts
var registerSlopeSeries = () => registerSeriesType("slope", SlopeSeries);
registerSlopeSeries();

// src/series/sparkline.ts
var MIN_COLOR = "#e63946", MAX_COLOR = "#00b894", SparklineSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  render(ctx) {
    let { renderer } = ctx, g = renderer.group(
      { class: `facet-series facet-sparkline ${this.name}` },
      renderer.root
    ), data = [];
    for (let p of this.points)
      p.y !== void 0 && data.push({ pt: { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(p.y) }, p });
    if (data.length) {
      renderer.create(
        "path",
        {
          d: linePath(data.map((d) => d.pt)),
          fill: "none",
          stroke: this.color,
          "stroke-width": this.options.lineWidth ?? 1.5,
          "stroke-linejoin": "round",
          "stroke-linecap": "round"
        },
        g
      );
      for (let { pt, p } of data) {
        let hit = renderer.create(
          "circle",
          { cx: pt.x, cy: pt.y, r: 6, fill: "transparent", "pointer-events": "all" },
          g
        );
        ctx.registerHover(hit, p), hit.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), hit.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), hit.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      }
      this.drawHighlights(renderer, g, data);
    }
  }
  /** The last/min/max point markers, per `series.sparkline`. */
  drawHighlights(renderer, g, data) {
    let opts = this.options.sparkline ?? {}, marker = this.options.marker ?? {};
    if (marker.enabled === !1) return;
    let radius = marker.radius ?? 2.5, dot = (point, spec, defaultColor) => {
      if (!spec) return;
      let color = (typeof spec == "object" ? spec.color : void 0) ?? defaultColor;
      drawMarker(renderer, g, point.pt.x, point.pt.y, {
        symbol: marker.symbol ?? "circle",
        radius,
        fill: marker.fillColor ?? color,
        stroke: marker.lineColor ?? "#fff",
        strokeWidth: marker.lineWidth ?? 1,
        width: marker.width,
        height: marker.height
      });
    };
    if (dot(data[data.length - 1], opts.last ?? !0, this.color), opts.min || opts.max) {
      let minPt = data[0], maxPt = data[0];
      for (let d of data)
        (d.p.y ?? 0) < (minPt.p.y ?? 0) && (minPt = d), (d.p.y ?? 0) > (maxPt.p.y ?? 0) && (maxPt = d);
      dot(minPt, opts.min, MIN_COLOR), dot(maxPt, opts.max, MAX_COLOR);
    }
  }
};

// src/entries/series/sparkline.ts
var registerSparklineSeries = () => registerSeriesType("sparkline", SparklineSeries);
registerSparklineSeries();

// src/series/sunburst.ts
var SunburstSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-sunburst ${this.name}` }, renderer.root), byId = /* @__PURE__ */ new Map();
    for (let p of this.points) {
      let id = String(p.options.id ?? p.name ?? p.x);
      byId.set(id, { point: p, id, name: String(p.name ?? p.options.name ?? id), value: p.y ?? p.options.value ?? 0, depth: 0, children: [] });
    }
    let roots = [];
    for (let n of byId.values()) {
      let parent = n.point?.options.parent ? byId.get(String(n.point.options.parent)) : void 0;
      parent ? parent.children.push(n) : roots.push(n);
    }
    let root = roots.length === 1 ? roots[0] : { id: "__root", name: "", value: 0, depth: -1, children: roots }, rollup = (n) => (n.children.length && (n.value = n.children.reduce((s, c) => s + rollup(c), 0)), n.value);
    if (rollup(root), root.value <= 0) return;
    let maxDepth = 0, setDepth = (n, d) => {
      n.depth = d, maxDepth = Math.max(maxDepth, d), n.children.forEach((c) => setDepth(c, d + 1));
    };
    root.children.forEach((c) => setDepth(c, 0));
    let cx = plot.x + plot.width / 2, cy = plot.y + plot.height / 2, R = Math.min(plot.width, plot.height) / 2 - 6, ringW = R / (maxDepth + 1), draw = (n, a0, a1, ci) => {
      if (n.depth >= 0) {
        let rIn = n.depth * ringW, rOut = n.children.length ? (n.depth + 1) * ringW : R, base = n.color ?? paletteColor(colors, ci), color = n.point?.color ?? shade(base, n.depth * 0.12), el = renderer.create("path", {
          d: this.arc(cx, cy, rIn, rOut, a0, a1),
          fill: color,
          stroke: "#fff",
          "stroke-width": 1,
          class: "facet-point"
        }, g);
        if (n.point && (ctx.registerHover(el, n.point), el.addEventListener("click", (e) => ctx.onPointEvent("click", n.point, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", n.point, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", n.point, e))), !ctx.suppressDataLabels && a1 - a0 > 0.18 && rOut - rIn > 14) {
          let mid = (a0 + a1) / 2, rMid = (rIn + rOut) / 2;
          renderer.text(n.name, cx + rMid * Math.cos(mid), cy + rMid * Math.sin(mid), {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            ...FONTS.dataLabel,
            fill: "#fff",
            "font-size": scaledFontPx(10)
          }, g);
        }
      }
      let a = a0;
      n.children.forEach((c, i) => {
        let span = c.value / n.value * (a1 - a0);
        draw(c, a, a + span, n.depth < 0 ? i : ci), a += span;
      });
    };
    draw(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0);
  }
  arc(cx, cy, rIn, rOut, a0, a1) {
    let large = a1 - a0 > Math.PI ? 1 : 0, p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return rIn <= 0 ? `M ${cx} ${cy} L ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} Z` : `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)} Z`;
  }
};

// src/entries/series/sunburst.ts
var registerSunburstSeries = () => registerSeriesType("sunburst", SunburstSeries);
registerSunburstSeries();

// src/series/tick.ts
var TickSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !1 };
  }
  render(ctx) {
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, g = renderer.group(
      { class: `facet-series facet-tick ${this.name}` },
      renderer.root
    ), subWidth = catScale.bandwidth() / groupCount, maxWidth = Math.max(1, subWidth * 0.9), thickness = this.options.lineWidth ?? 4;
    for (let p of this.points) {
      if (p.y === void 0) continue;
      let width = p.options.columnWidth ?? this.options.columnWidth ?? this.options.size ?? maxWidth, center = catScale.scale(p.x), gap = subWidth - maxWidth, groupWidth = groupCount * width + (groupCount - 1) * gap, start = center - groupWidth / 2 + groupIndex * (width + gap), v = valScale.scale(p.y), color = p.color ?? this.color, coords = inverted ? { x1: v, y1: start, x2: v, y2: start + width } : { x1: start, y1: v, x2: start + width, y2: v }, el = renderer.create(
        "line",
        { ...coords, stroke: color, "stroke-width": thickness, class: "facet-point" },
        g
      );
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e)), this.drawLabel(ctx, p, start + width / 2, v, inverted);
    }
  }
  drawLabel(ctx, p, mid, v, inverted) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    let text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: this.name,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? this.color
    }), gap = 10 + (dl.distance ?? 0), negative = (p.y ?? 0) < 0, place;
    inverted ? place = negative ? { x: v - gap, y: mid + 4, anchor: "end" } : { x: v + gap, y: mid + 4, anchor: "start" } : place = negative ? { x: mid, y: v + gap + 4, anchor: "middle" } : { x: mid, y: v - gap, anchor: "middle" }, drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
};

// src/entries/series/tick.ts
var registerTickSeries = () => registerSeriesType("tick", TickSeries);
registerTickSeries();

// src/series/timeline.ts
var TimelineSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-timeline ${this.name}` }, renderer.root), points = this.visiblePoints();
    if (!points.length) return;
    let cy = plot.y + plot.height / 2, pad = 40, span = plot.width - pad * 2, step = points.length > 1 ? span / (points.length - 1) : 0;
    renderer.create("line", { x1: plot.x + pad, y1: cy, x2: plot.x + plot.width - pad, y2: cy, stroke: THEME.axis.lineColor, "stroke-width": 2 }, g), points.forEach((p, i) => {
      let x = plot.x + pad + i * step, above = i % 2 === 0, color = p.color ?? paletteColor(colors, i), stub = above ? -34 : 34;
      renderer.create("line", { x1: x, y1: cy, x2: x, y2: cy + stub, stroke: color, "stroke-width": 1.5 }, g);
      let marker = renderer.create("circle", { cx: x, cy, r: 6, fill: color, stroke: "#fff", "stroke-width": 2, class: "facet-point" }, g), ty = cy + stub + (above ? -6 : 16);
      renderer.text(String(p.x ?? p.name), x, ty, { "text-anchor": "middle", ...FONTS.axisLabel, "font-weight": "600", fill: color }, g);
      let desc = p.options.name ?? p.name;
      desc && String(desc) !== String(p.x) && renderer.text(String(desc), x, ty + (above ? -13 : 13), { "text-anchor": "middle", ...FONTS.axisLabel }, g), ctx.registerHover(marker, p), marker.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), marker.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), marker.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
};

// src/entries/series/timeline.ts
var registerTimelineSeries = () => registerSeriesType("timeline", TimelineSeries);
registerTimelineSeries();

// src/series/treegraph.ts
var TreegraphSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-treegraph ${this.name}` }, renderer.root), byId = /* @__PURE__ */ new Map();
    for (let p of this.points) {
      let id = String(p.options.id ?? p.name ?? p.x);
      byId.set(id, { point: p, id, depth: 0, y: 0, children: [] });
    }
    let roots = [];
    for (let n of byId.values()) {
      let parent = n.point.options.parent ? byId.get(String(n.point.options.parent)) : void 0;
      parent ? parent.children.push(n) : roots.push(n);
    }
    if (!roots.length) return;
    let leaf = 0, maxDepth = 0, visit = (n, depth) => {
      if (n.depth = depth, maxDepth = Math.max(maxDepth, depth), !n.children.length)
        return n.y = leaf++, n.y;
      let ys = n.children.map((c) => visit(c, depth + 1));
      return n.y = ys.reduce((a, b) => a + b, 0) / ys.length, n.y;
    };
    roots.forEach((r) => visit(r, 0));
    let leaves = Math.max(1, leaf), colGap = plot.width / (maxDepth + 1), rowGap = plot.height / leaves, nodeX = (d) => plot.x + d * colGap + 8, nodeY = (y) => plot.y + (y + 0.5) * rowGap, boxW = Math.min(colGap - 24, 120), boxH = Math.min(rowGap * 0.6, 26);
    for (let n of byId.values())
      for (let c of n.children) {
        let x1 = nodeX(n.depth) + boxW, y1 = nodeY(n.y), x2 = nodeX(c.depth), y2 = nodeY(c.y), mx = (x1 + x2) / 2;
        renderer.create("path", { d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, fill: "none", stroke: "#c4ccd8", "stroke-width": 1.5 }, g);
      }
    let ci = 0;
    for (let n of byId.values()) {
      let x = nodeX(n.depth), y = nodeY(n.y), color = n.point.color ?? paletteColor(colors, n.depth === 0 ? 0 : ci++), box = renderer.group({ class: "facet-point" }, g);
      renderer.create("rect", { x, y: y - boxH / 2, width: boxW, height: boxH, rx: 5, fill: color }, box), renderer.text(String(n.point.name ?? n.id), x + boxW / 2, y, {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: "#ffffff",
        "font-size": scaledFontPx(11)
      }, box), ctx.registerHover(box, n.point), box.addEventListener("click", (e) => ctx.onPointEvent("click", n.point, e)), box.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", n.point, e)), box.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", n.point, e));
    }
  }
};

// src/entries/series/treegraph.ts
var registerTreegraphSeries = () => registerSeriesType("treegraph", TreegraphSeries);
registerTreegraphSeries();

// src/series/waterfall.ts
var WaterfallSeries = class extends BaseSeries {
  constructor() {
    super(...arguments);
    this.colors = { up: "#26a69a", down: "#ef5350", sum: "#4472c4" };
  }
  capabilities() {
    return { grouped: !1, cartesian: !0, stackable: !1 };
  }
  /** Cumulative extent so the value axis fits every floating bar. */
  valueExtent() {
    let cum = 0, min = 0, max = 0;
    for (let p of this.points)
      if (p.options.isSum || p.options.isIntermediateSum)
        min = Math.min(min, cum), max = Math.max(max, cum);
      else {
        let prev = cum;
        cum += p.y ?? 0, min = Math.min(min, prev, cum), max = Math.max(max, prev, cum);
      }
    return [min, max];
  }
  render(ctx) {
    let { renderer, yScale } = ctx, catScale = ctx.xScale, g = renderer.group({ class: `facet-series facet-waterfall ${this.name}` }, renderer.root), barW = catScale.bandwidth() * 0.6, zeroY = yScale.scale(0), cum = 0, prevEndX = null, prevY = zeroY;
    for (let p of this.points) {
      let isSum = !!(p.options.isSum || p.options.isIntermediateSum), from = isSum ? 0 : cum, to = isSum ? cum : cum + (p.y ?? 0);
      isSum || (cum = to);
      let x0 = catScale.scale(p.x) - barW / 2, yTop = yScale.scale(Math.max(from, to)), yBot = yScale.scale(Math.min(from, to)), color = p.color ?? (isSum ? this.colors.sum : to >= from ? this.colors.up : this.colors.down);
      prevEndX !== null && renderer.create("line", { x1: prevEndX, y1: prevY, x2: x0, y2: prevY, stroke: "#b0b0b0", "stroke-width": 1, "stroke-dasharray": "2 2" }, g);
      let el = renderer.create("rect", {
        x: x0,
        y: yTop,
        width: barW,
        height: Math.max(1, yBot - yTop),
        fill: color,
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e)), prevEndX = x0 + barW, prevY = yScale.scale(to);
    }
  }
};

// src/entries/series/waterfall.ts
var registerWaterfallSeries = () => registerSeriesType("waterfall", WaterfallSeries);
registerWaterfallSeries();

// src/series/register-all.ts
function registerAllSeries() {
  registerAreaSeries(), registerBoxplotSeries(), registerBubbleSeries(), registerBulletSeries(), registerCalendarSeries(), registerCandlestickSeries(), registerColumnSeries(), registerColumnRangeSeries(), registerDumbbellSeries(), registerErrorBarSeries(), registerFunnelSeries(), registerGanttSeries(), registerGaugeSeries(), registerHeatmapSeries(), registerHistogramSeries(), registerLineSeries(), registerLollipopSeries(), registerMarimekkoSeries(), registerPieSeries(), registerRadarSeries(), registerRadialBarSeries(), registerRangeSeries(), registerSankeySeries(), registerScatterSeries(), registerSlopeSeries(), registerSparklineSeries(), registerSunburstSeries(), registerTickSeries(), registerTimelineSeries(), registerTreegraphSeries(), registerWaterfallSeries();
}

// src/core/renderer.ts
var SVG_NS = "http://www.w3.org/2000/svg", Renderer = class {
  constructor(width, height) {
    this.root = document.createElementNS(SVG_NS, "svg"), this.root.setAttribute("xmlns", SVG_NS), this.setSize(width, height), this.root.setAttribute("class", "facet-root"), this.root.style.maxWidth = "100%", this.root.style.height = "auto", this.root.style.display = "block";
  }
  setSize(width, height) {
    this.root.setAttribute("width", String(width)), this.root.setAttribute("height", String(height)), this.root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  /** Create an SVG element with attributes, optionally appending to a parent. */
  create(tag, attrs = {}, parent) {
    let el = document.createElementNS(SVG_NS, tag);
    return this.attr(el, attrs), parent && parent.appendChild(el), el;
  }
  /** A grouping <g>, the usual container for a logical chart part. */
  group(attrs = {}, parent) {
    return this.create("g", attrs, parent ?? this.root);
  }
  attr(el, attrs) {
    for (let key in attrs) {
      let value = attrs[key];
      value != null && el.setAttribute(key, String(value));
    }
  }
  /** Positioned, styleable text. Returns the element so callers can measure it. */
  text(content, x, y, attrs = {}, parent) {
    let el = this.create("text", { x, y, ...attrs }, parent ?? this.root);
    return el.textContent = content, el;
  }
  /**
   * Measure SVG text using the live renderer when the DOM supports it, with a
   * deterministic font-size fallback for headless and pre-mount environments.
   */
  measureText(content, attrs = {}) {
    let fontSize = parseFloat(String(attrs["font-size"] ?? "11")) || 11, probe = this.text(content, -1e4, -1e4, {
      visibility: "hidden",
      ...attrs
    }), width = 0, height = fontSize;
    try {
      width = probe.getComputedTextLength?.() ?? 0;
      let box = probe.getBBox?.();
      box && (width = width || box.width, height = box.height || height);
    } catch {
    }
    return probe.remove(), {
      width: width || content.length * fontSize * 0.6,
      height
    };
  }
  /** Build an SVG path `d` string from segment tokens. */
  static path(segments) {
    return segments.map((s) => s.join(" ")).join(" ");
  }
  clear() {
    for (; this.root.firstChild; ) this.root.removeChild(this.root.firstChild);
  }
  mount(container) {
    container.appendChild(this.root);
  }
};

// src/core/axis.ts
function minorGridPositions(scale, interval) {
  if (scale instanceof CategoryScale) return [];
  let majorTicks = scale.ticks();
  if (interval === "auto") {
    let majorPositions = majorTicks.map((tick) => scale.scale(tick)).filter(Number.isFinite), positions2 = [];
    for (let i = 1; i < majorPositions.length; i++) {
      let start = majorPositions[i - 1], end = majorPositions[i];
      for (let part = 1; part < 5; part++)
        positions2.push(start + (end - start) * part / 5);
    }
    return positions2;
  }
  if (!(interval > 0) || !scale.invert) return [];
  let [rangeStart, rangeEnd] = scale.range(), domainStart = scale.invert(rangeStart), domainEnd = scale.invert(rangeEnd), lo = Math.min(domainStart, domainEnd), hi = Math.max(domainStart, domainEnd), epsilon = Math.max(Math.abs(lo), Math.abs(hi), 1) * 1e-10, majorValues = majorTicks.filter((tick) => typeof tick == "number").map(Number), positions = [], value = Math.ceil((lo - epsilon) / interval) * interval;
  for (let count = 0; value <= hi + epsilon && count < 1e3; count++, value += interval)
    !majorValues.some(
      (major) => Math.abs(major - value) <= epsilon
    ) && value > lo + epsilon && value < hi - epsilon && positions.push(scale.scale(value));
  return positions;
}
var Axis = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  get horizontal() {
    return this.cfg.position === "bottom" || this.cfg.position === "top";
  }
  get labelOffset() {
    let value = this.cfg.options.labels?.offset;
    return typeof value == "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  render(parent) {
    let { renderer, scale, options, position } = this.cfg;
    if (options.visible === !1) return;
    let group = renderer.group({ class: `facet-axis facet-axis-${position}` }, parent), ticks = scale.ticks(), isCategory = scale instanceof CategoryScale;
    this.drawAlternateCategoryBands(group), this.drawPlotBands(group);
    let axisColor = options.lineColor ?? THEME.axis.lineColor;
    if (options.lineWidth !== 0) {
      let line = this.axisLineCoords();
      renderer.create("line", {
        ...line,
        stroke: axisColor,
        "stroke-width": options.lineWidth ?? 1
      }, group);
    }
    let labelsEnabled = options.labels?.enabled !== !1, gridColor = options.gridLineColor ?? THEME.axis.gridLineColor, gridWidth = options.gridLineWidth ?? 1, labelStep = Math.max(1, options.labels?.step ?? 1), labelRotation = options.labels?.rotation ?? 0;
    if (isCategory && labelsEnabled && this.horizontal) {
      let band = scale.bandwidth();
      if (band > 0) {
        let style = this.labelStyle(), widest = ticks.reduce(
          (m, t) => Math.max(m, renderer.measureText(this.labelText(scale, t), style).width),
          0
        );
        if (options.labels?.rotation === void 0) {
          let candidates = options.labels?.autoRotation ?? [0];
          labelRotation = candidates.find((rotation) => {
            let rad2 = Math.abs(rotation) * Math.PI / 180;
            return Math.cos(rad2) * widest + Math.sin(rad2) * (parseFloat(style["font-size"] ?? "11") || 11) + 6 <= band * labelStep;
          }) ?? candidates[candidates.length - 1] ?? 0;
        }
        let rad = Math.abs(labelRotation) * Math.PI / 180, projected = Math.cos(rad) * widest + Math.sin(rad) * (parseFloat(style["font-size"] ?? "11") || 11);
        projected + 6 > band * labelStep && (labelStep = Math.ceil((projected + 6) / band));
      }
    }
    let minorGridWidth = options.minorGridLineWidth ?? 1;
    if (this.cfg.grid && !isCategory && options.minorTickInterval !== void 0 && minorGridWidth > 0) {
      let minorColor = options.minorGridLineColor ?? gridColor, minorDash = options.minorGridLineDashStyle ?? "2 2";
      for (let pos of minorGridPositions(scale, options.minorTickInterval))
        this.drawGridLine(
          group,
          pos,
          minorColor,
          minorGridWidth,
          minorDash,
          "facet-minor-gridline"
        );
    }
    ticks.forEach((tick, i) => {
      let pos = scale.scale(tick);
      this.cfg.grid && gridWidth > 0 && (!isCategory || options.gridLineWidth) && this.drawGridLine(
        group,
        pos,
        gridColor,
        gridWidth,
        options.gridLineDashStyle,
        "facet-gridline"
      ), options.ticks !== !1 && this.drawTick(group, pos, axisColor), labelsEnabled && i % labelStep === 0 && this.drawLabel(
        group,
        pos,
        this.labelText(scale, tick),
        options,
        labelRotation
      );
    }), this.drawPlotLines(group, "below"), options.title?.text && options.title.enabled !== !1 && this.drawTitle(group, options.title.text);
  }
  /**
   * Re-draws only the `zIndex: 'above'` plotLines, into a group the caller
   * appends after the series so they paint on top of the data instead of
   * under it. No-op (and no group created) when there are none.
   */
  renderAbove(parent) {
    let { options, position, renderer } = this.cfg;
    if (options.visible === !1 || !(options.plotLines ?? []).some((l) => l.zIndex === "above")) return;
    let group = renderer.group({ class: `facet-axis-above facet-axis-${position}` }, parent);
    this.drawPlotLines(group, "above");
  }
  /** Fill every other full category step across the plot area. */
  drawAlternateCategoryBands(g) {
    let { renderer, scale, plot, options } = this.cfg;
    if (!(scale instanceof CategoryScale) || typeof options.alternateGridColor != "string")
      return;
    let halfStep = Math.abs(scale.fullStep()) / 2;
    scale.ticks().forEach((tick, index) => {
      if (index % 2 === 0) return;
      let centre = scale.scale(tick), rect = this.horizontal ? {
        x: Math.max(plot.x, centre - halfStep),
        y: plot.y,
        width: Math.min(plot.x + plot.width, centre + halfStep) - Math.max(plot.x, centre - halfStep),
        height: plot.height
      } : {
        x: plot.x,
        y: Math.max(plot.y, centre - halfStep),
        width: plot.width,
        height: Math.min(plot.y + plot.height, centre + halfStep) - Math.max(plot.y, centre - halfStep)
      };
      renderer.create(
        "rect",
        {
          ...rect,
          fill: options.alternateGridColor,
          stroke: "none",
          class: "facet-alternate-grid-band"
        },
        g
      );
    });
  }
  /** Shaded bands spanning an axis interval (horizontal or vertical). */
  drawPlotBands(g) {
    let { renderer, scale, plot } = this.cfg;
    for (let band of this.cfg.options.plotBands ?? []) {
      let p0 = scale.scale(band.from), p1 = scale.scale(band.to), rect = this.horizontal ? { x: Math.min(p0, p1), y: plot.y, width: Math.abs(p1 - p0), height: plot.height } : { x: plot.x, y: Math.min(p0, p1), width: plot.width, height: Math.abs(p1 - p0) };
      if (renderer.create("rect", { ...rect, fill: band.color ?? "rgba(70,130,180,0.12)", stroke: "none", class: "facet-plotband" }, g), band.label?.text) {
        let align = band.label.align ?? "left", x = align === "center" ? rect.x + rect.width / 2 : align === "right" ? rect.x + rect.width - 4 : rect.x + 4;
        renderer.text(band.label.text, x, rect.y + 12, {
          ...FONTS.axisLabel,
          fill: band.label.color ?? "#666",
          "text-anchor": align === "center" ? "middle" : align === "right" ? "end" : "start"
        }, g);
      }
    }
  }
  /**
   * Reference lines at fixed axis values (horizontal or vertical). `which`
   * selects the subset to draw: lines default to `'below'` (drawn as part
   * of the axis, under the series) unless `zIndex: 'above'` is set.
   */
  drawPlotLines(g, which) {
    let { renderer, scale, plot } = this.cfg;
    for (let line of this.cfg.options.plotLines ?? []) {
      if ((line.zIndex === "above" ? "above" : "below") !== which) continue;
      let pos = scale.scale(line.value), coords = this.horizontal ? { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height } : { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos };
      if (renderer.create("line", {
        ...coords,
        stroke: line.color ?? "#e63946",
        "stroke-width": line.width ?? 1.5,
        "stroke-dasharray": line.dashStyle ?? void 0,
        class: "facet-plotline"
      }, g), line.label?.text) {
        let estW = line.label.text.length * 6.2 + 6, vAlign = line.label.verticalAlign ?? "above", lx, ly, anchor;
        if (this.horizontal) {
          let align = line.label.align;
          align === "left" ? (lx = pos - 4, anchor = "end") : align === "right" ? (lx = pos + 4, anchor = "start") : align === "center" ? (lx = pos, anchor = "middle") : pos + 4 + estW <= plot.x + plot.width ? (lx = pos + 4, anchor = "start") : (lx = Math.max(plot.x + estW, pos - 4), anchor = "end"), ly = vAlign === "below" ? plot.y + plot.height - 6 : plot.y + 12;
        } else {
          let align = line.label.align ?? "right";
          align === "left" ? (lx = plot.x + 4, anchor = "start") : align === "center" ? (lx = plot.x + plot.width / 2, anchor = "middle") : (lx = plot.x + plot.width - 4, anchor = "end");
          let target = vAlign === "below" ? pos + 14 : pos - 4;
          ly = Math.max(plot.y + 10, Math.min(plot.y + plot.height - 4, target));
        }
        renderer.text(line.label.text, lx, ly, {
          ...FONTS.axisLabel,
          fill: line.label.color ?? line.color ?? "#e63946",
          "text-anchor": anchor
        }, g);
      }
    }
  }
  labelText(scale, tick) {
    let opts = this.cfg.options.labels;
    if (opts?.formatter) return opts.formatter(tick);
    let base = scale.tickLabel(tick);
    return opts?.format ? formatString(opts.format, { value: typeof tick == "number" ? tick : base }) : base;
  }
  axisLineCoords() {
    let { plot, position } = this.cfg;
    switch (position) {
      case "bottom":
        return { x1: plot.x, y1: plot.y + plot.height, x2: plot.x + plot.width, y2: plot.y + plot.height };
      case "top":
        return { x1: plot.x, y1: plot.y, x2: plot.x + plot.width, y2: plot.y };
      case "left":
        return { x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.height };
      case "right":
        return { x1: plot.x + plot.width, y1: plot.y, x2: plot.x + plot.width, y2: plot.y + plot.height };
    }
  }
  drawGridLine(g, pos, color, width, dashStyle, className) {
    let { renderer, plot } = this.cfg, attrs = {
      stroke: color,
      "stroke-width": width,
      "stroke-dasharray": dashStyle,
      class: className
    };
    this.horizontal ? renderer.create("line", {
      x1: pos,
      y1: plot.y,
      x2: pos,
      y2: plot.y + plot.height,
      ...attrs
    }, g) : renderer.create("line", {
      x1: plot.x,
      y1: pos,
      x2: plot.x + plot.width,
      y2: pos,
      ...attrs
    }, g);
  }
  drawTick(g, pos, color) {
    let { renderer, plot, position } = this.cfg, len = LAYOUT.tickLength;
    switch (position) {
      case "bottom":
        renderer.create("line", { x1: pos, y1: plot.y + plot.height, x2: pos, y2: plot.y + plot.height + len, stroke: color }, g);
        break;
      case "top":
        renderer.create("line", { x1: pos, y1: plot.y, x2: pos, y2: plot.y - len, stroke: color }, g);
        break;
      case "left":
        renderer.create("line", { x1: plot.x - len, y1: pos, x2: plot.x, y2: pos, stroke: color }, g);
        break;
      case "right":
        renderer.create("line", { x1: plot.x + plot.width, y1: pos, x2: plot.x + plot.width + len, y2: pos, stroke: color }, g);
        break;
    }
  }
  labelStyle() {
    let customStyle = sanitizeStyle(this.cfg.options.labels?.style);
    return { ...FONTS.axisLabel, ...customStyle };
  }
  fitLabel(text, style) {
    let maxWidth = this.cfg.options.labels?.maxWidth;
    if (!maxWidth || this.cfg.renderer.measureText(text, style).width <= maxWidth)
      return text;
    if (this.cfg.options.labels?.overflow === "hide") return;
    let lo = 0, hi = text.length;
    for (; lo < hi; ) {
      let mid = Math.ceil((lo + hi) / 2), candidate = `${text.slice(0, mid)}\u2026`;
      this.cfg.renderer.measureText(candidate, style).width <= maxWidth ? lo = mid : hi = mid - 1;
    }
    return lo ? `${text.slice(0, lo)}\u2026` : void 0;
  }
  drawLabel(g, pos, rawText, options, resolvedRotation) {
    let { renderer, plot, position } = this.cfg, style = this.labelStyle(), text = this.fitLabel(rawText, style);
    if (text === void 0) return;
    let rotation = resolvedRotation ?? options.labels?.rotation ?? 0, offset = this.labelOffset, x = 0, y = 0, anchor = "middle", baseline = "middle";
    switch (position) {
      case "bottom":
        x = pos, y = plot.y + plot.height + LAYOUT.tickLength + (rotation ? 8 : 7) + offset, baseline = rotation ? "middle" : "hanging", anchor = rotation ? rotation < 0 ? "end" : "start" : "middle";
        break;
      case "top":
        x = pos, y = plot.y - LAYOUT.tickLength - (rotation ? 8 : 6) - offset, anchor = rotation ? rotation < 0 ? "start" : "end" : "middle";
        break;
      case "left":
        x = plot.x - LAYOUT.tickLength - 4 - offset, y = pos, anchor = "end";
        break;
      case "right":
        x = plot.x + plot.width + LAYOUT.tickLength + 4 + offset, y = pos, anchor = "start";
        break;
    }
    let el = renderer.text(text, x, y, {
      "text-anchor": anchor,
      "dominant-baseline": baseline,
      ...style
    }, g);
    rotation && el.setAttribute("transform", `rotate(${rotation} ${x} ${y})`);
  }
  drawTitle(g, text) {
    let { renderer, plot, position } = this.cfg, style = {
      ...FONTS.axisTitle,
      ...sanitizeStyle(this.cfg.options.title?.style)
    }, gap = this.cfg.options.labels?.enabled !== !1 ? this.labelExtent() + this.labelOffset : 0, defaultMargin = (this.horizontal ? LAYOUT.axisTitleGap : 8) * (this.cfg.spacingScale ?? 1), margin = this.cfg.options.title?.margin ?? defaultMargin, offset = this.cfg.options.title?.offset ?? 0, align = this.cfg.options.title?.align ?? "center", along = align === "start" ? 0 : align === "end" ? 1 : 0.5;
    if (this.horizontal) {
      let x = plot.x + plot.width * along, y = position === "bottom" ? plot.y + plot.height + LAYOUT.tickLength + gap + margin + offset + 8 : plot.y - LAYOUT.tickLength - gap - margin - offset - 4;
      renderer.text(text, x, y, {
        "text-anchor": align === "start" ? "start" : align === "end" ? "end" : "middle",
        ...style
      }, g);
    } else {
      let x = position === "left" ? plot.x - LAYOUT.tickLength - 4 - gap - margin - offset : plot.x + plot.width + LAYOUT.tickLength + 4 + gap + margin + offset, y = plot.y + plot.height * along, rot = position === "left" ? -90 : 90;
      renderer.text(text, x, y, {
        "text-anchor": align === "start" ? "start" : align === "end" ? "end" : "middle",
        transform: `rotate(${rot} ${x} ${y})`,
        ...style
      }, g);
    }
  }
  /**
   * Estimated size of the tick labels along the axis-title direction: the
   * widest label (px) for vertical axes, or the label height for horizontal
   * axes. Used to offset the title clear of the labels.
   */
  labelExtent() {
    let { scale, options } = this.cfg, labelStyle = sanitizeStyle(options.labels?.style), fontPx = parseFloat(labelStyle["font-size"] ?? FONTS.axisLabel["font-size"] ?? "11") || 11, maxW = 0;
    for (let t of scale.ticks()) {
      let measured = this.cfg.renderer.measureText(this.labelText(scale, t), {
        ...FONTS.axisLabel,
        ...labelStyle
      }).width;
      maxW = Math.max(
        maxW,
        options.labels?.maxWidth ? Math.min(measured, options.labels.maxWidth) : measured
      );
    }
    let rot = options.labels?.rotation ?? 0;
    return this.horizontal ? rot ? Math.abs(Math.sin(rot * Math.PI / 180)) * maxW + fontPx : fontPx + 2 : maxW;
  }
};

// src/core/nested-axis.ts
var NESTED_SPLIT_TIER_GAP = 6, NESTED_SPLIT_TIER_PITCH = 18 + NESTED_SPLIT_TIER_GAP;
function nestedLevelWidths(leaves) {
  let levels = leaves[0]?.length ?? 0, widths = [];
  for (let level = 0; level < levels; level++) {
    let maxLen = 0;
    for (let leaf of leaves)
      maxLen = Math.max(maxLen, (leaf[level] ?? "").length);
    widths[level] = Math.max(40, maxLen * 6.6 + 12);
  }
  return widths;
}
function nestedInnerRotationExtent(leaves, rotation) {
  if (!rotation) return 0;
  let labelW = leaves.reduce(
    (m, l) => Math.max(m, String(l[l.length - 1] ?? "").length),
    0
  ) * 6.2 + 6;
  return Math.abs(Math.sin(rotation * Math.PI / 180)) * labelW;
}
var NestedAxis = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  get labelsOn() {
    return this.cfg.labels?.enabled !== !1;
  }
  get linesOn() {
    return this.cfg.lineWidth !== 0;
  }
  /** Positive values move every label tier away from the axis baseline. */
  get labelOffset() {
    if (!this.labelsOn) return 0;
    let value = this.cfg.labels?.offset;
    return typeof value == "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  /** No-ops (and returns undefined) when labels are switched off. */
  text(text, x, y, attrs, g) {
    if (!this.labelsOn) return;
    let labels = this.cfg.labels, formatted = labels?.formatter ? labels.formatter(text) : labels?.format ? formatString(labels.format, { value: text }) : text;
    return this.cfg.renderer.text(String(formatted), x, y, {
      ...attrs,
      ...sanitizeStyle(labels?.style)
    }, g);
  }
  /** No-ops when the axis's own lines (baseline, dividers) are switched off. */
  line(attrs, g) {
    this.linesOn && this.cfg.renderer.create("line", attrs, g);
  }
  render(parent) {
    if (typeof this.cfg.alternateGridColor == "string") {
      let bandGroup = this.cfg.renderer.group(
        { class: "facet-alternate-grid-bands" },
        parent
      );
      parent.insertBefore(bandGroup, parent.firstChild), this.drawAlternateCategoryBands(bandGroup);
    }
    let g = this.cfg.renderer.group(
      { class: "facet-axis facet-axis-nested" },
      parent
    );
    this.drawLeafGridlines(g), this.cfg.vertical ? this.cfg.position === "split" ? this.renderSplitVertical(g) : this.renderStackedVertical(g, this.cfg.position === "top") : this.cfg.position === "split" ? this.renderSplit(g) : this.renderStacked(g, this.cfg.position === "top"), this.drawTitle(g);
  }
  /** Fill every other leaf category behind nested-axis series. */
  drawAlternateCategoryBands(g) {
    let { alternateGridColor, renderer, scale, plot, keys, vertical } = this.cfg;
    if (typeof alternateGridColor != "string") return;
    let halfStep = Math.abs(scale.fullStep()) / 2;
    keys.forEach((key, index) => {
      if (index % 2 === 0) return;
      let centre = scale.scale(key), rect = vertical ? {
        x: plot.x,
        y: Math.max(plot.y, centre - halfStep),
        width: plot.width,
        height: Math.min(plot.y + plot.height, centre + halfStep) - Math.max(plot.y, centre - halfStep)
      } : {
        x: Math.max(plot.x, centre - halfStep),
        y: plot.y,
        width: Math.min(plot.x + plot.width, centre + halfStep) - Math.max(plot.x, centre - halfStep),
        height: plot.height
      };
      renderer.create(
        "rect",
        {
          ...rect,
          fill: alternateGridColor,
          stroke: "none",
          class: "facet-alternate-grid-band"
        },
        g
      );
    });
  }
  drawTitle(g) {
    let title = this.cfg.title;
    if (!title?.text || title.enabled === !1) return;
    let { plot, leaves, vertical, position } = this.cfg, levels = leaves[0]?.length ?? 0, align = title.align ?? "center", along = align === "start" ? 0 : align === "end" ? 1 : 0.5, style = {
      ...FONTS.axisTitle,
      ...sanitizeStyle(title.style),
      "text-anchor": align === "start" ? "start" : align === "end" ? "end" : "middle"
    };
    if (vertical) {
      let widths = nestedLevelWidths(leaves), sideRight = position === "top", extent2 = position === "split" ? widths[widths.length - 1] ?? 0 : widths.reduce((sum2, width) => sum2 + width, 0), x2 = sideRight ? plot.x + plot.width + LAYOUT.tickLength + this.labelOffset + extent2 + (title.margin ?? 16 * (this.cfg.spacingScale ?? 1)) + (title.offset ?? 0) : plot.x - LAYOUT.tickLength - this.labelOffset - extent2 - (title.margin ?? 16 * (this.cfg.spacingScale ?? 1)) - (title.offset ?? 0), y2 = plot.y + plot.height * along, rotation2 = sideRight ? 90 : -90;
      this.cfg.renderer.text(title.text, x2, y2, {
        ...style,
        transform: `rotate(${rotation2} ${x2} ${y2})`
      }, g);
      return;
    }
    let rotation = this.cfg.labels?.rotation ?? 0, rotExtra = nestedInnerRotationExtent(leaves, rotation), top = position === "top", splitSeparatorExtra = Math.max(0, levels - 2) * NESTED_SPLIT_TIER_GAP, labelExtent = position === "split" ? Math.max(30 + splitSeparatorExtra, 18 + rotExtra) : levels * 18 + rotExtra, x = plot.x + plot.width * along, margin = title.margin ?? LAYOUT.axisTitleGap * (this.cfg.spacingScale ?? 1), offset = title.offset ?? 0, y = top ? plot.y - LAYOUT.tickLength - this.labelOffset - labelExtent - margin - offset : plot.y + plot.height + LAYOUT.tickLength + this.labelOffset + labelExtent + margin + offset;
    this.cfg.renderer.text(title.text, x, y, style, g);
  }
  /** A gridline through the plot at each leaf position, opt-in via `gridLineWidth`. */
  drawLeafGridlines(g) {
    let width = this.cfg.gridLineWidth;
    if (!width) return;
    let { renderer, scale, plot, keys } = this.cfg, color = this.cfg.gridLineColor ?? THEME.axis.gridLineColor;
    for (let key of keys) {
      let pos = scale.scale(key), coords = this.cfg.vertical ? { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos } : { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height };
      renderer.create(
        "line",
        { ...coords, stroke: color, "stroke-width": width },
        g
      );
    }
  }
  /** All tiers on one side (below or above the plot). */
  renderStacked(g, top) {
    let { scale, plot, leaves, keys } = this.cfg, color = this.cfg.lineColor ?? THEME.axis.lineColor, levels = leaves[0]?.length ?? 0, dir = top ? -1 : 1, baseY = top ? plot.y : plot.y + plot.height, rowH = 18, rotation = this.cfg.labels?.rotation ?? 0, rotExtra = nestedInnerRotationExtent(leaves, rotation), rowHeight = (row) => row === 0 ? rowH + rotExtra : rowH, rowOffset = (row) => {
      let sum2 = 0;
      for (let r = 0; r < row; r++) sum2 += rowHeight(r);
      return sum2;
    }, leafCenter = (i) => scale.scale(keys[i]), bandHalf = scale.fullStep() / 2;
    this.line(
      { x1: plot.x, y1: baseY, x2: plot.x + plot.width, y2: baseY, stroke: color },
      g
    );
    for (let level = levels - 1; level >= 0; level--) {
      let row = levels - 1 - level, rotated = row === 0 && rotation, rowStart = baseY + dir * (LAYOUT.tickLength + this.labelOffset + rowOffset(row)), segments = this.segmentsForLevel(leaves, level), labelY = rowStart + dir * (rotated ? 8 : 12), labelSegs = row === 0 && !rotated ? this.thinnedInnerSegments(scale.bandwidth()) : segments;
      for (let seg of labelSegs) {
        let cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2, el = this.text(
          seg.label,
          cx,
          labelY,
          {
            "text-anchor": rotated ? rotation < 0 ? "end" : "start" : "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400"
          },
          g
        );
        rotated && el && el.setAttribute("transform", `rotate(${rotation} ${cx} ${labelY})`);
      }
    }
    let plotExtent = top ? plot.y + plot.height : plot.y;
    for (let boundary of this.categoryBoundaries()) {
      let row = levels - 1 - boundary.level, rowStart = baseY + dir * (LAYOUT.tickLength + this.labelOffset + rowOffset(row)), bx = leafCenter(boundary.startLeaf) - bandHalf, axisExtent = boundary.level === levels - 1 ? baseY : rowStart + dir * rowHeight(row);
      this.line(
        {
          x1: bx,
          y1: plotExtent,
          x2: bx,
          y2: axisExtent,
          stroke: color,
          "stroke-width": 1,
          class: "facet-nested-group-separator"
        },
        g
      );
    }
  }
  /**
   * Split layout: innermost dimension as normal labels at the bottom, outer
   * grouping dimensions stacked on top, and full-height vertical lines
   * separating the nested groups at every dimension level.
   */
  renderSplit(g) {
    let { scale, plot, leaves, keys } = this.cfg, color = this.cfg.lineColor ?? THEME.axis.lineColor, levels = leaves[0]?.length ?? 0, rowH = NESTED_SPLIT_TIER_PITCH, leafCenter = (i) => scale.scale(keys[i]), bandHalf = scale.fullStep() / 2, bottomY = plot.y + plot.height;
    this.line(
      { x1: plot.x, y1: bottomY, x2: plot.x + plot.width, y2: bottomY, stroke: color },
      g
    );
    let rotation = this.cfg.labels?.rotation ?? 0, innerLabelY = bottomY + LAYOUT.tickLength + this.labelOffset + (rotation ? 8 : 12), innerSegments = rotation ? this.segmentsForLevel(leaves, levels - 1) : this.thinnedInnerSegments(scale.bandwidth());
    for (let seg of innerSegments) {
      let cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2, el = this.text(
        seg.label,
        cx,
        innerLabelY,
        {
          "text-anchor": rotation ? rotation < 0 ? "end" : "start" : "middle",
          ...FONTS.axisLabel
        },
        g
      );
      rotation && el && el.setAttribute("transform", `rotate(${rotation} ${cx} ${innerLabelY})`);
    }
    for (let level = levels - 2; level >= 0; level--) {
      let rowFromTop = levels - 2 - level, labelY = plot.y - LAYOUT.tickLength - this.labelOffset - rowFromTop * rowH - 4;
      for (let seg of this.segmentsForLevel(leaves, level)) {
        let cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        this.text(
          seg.label,
          cx,
          labelY,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400"
          },
          g
        );
      }
    }
    for (let boundary of this.categoryBoundaries()) {
      let topExtent = boundary.level === levels - 1 ? plot.y : plot.y - LAYOUT.tickLength - this.labelOffset - (levels - 1 - boundary.level) * rowH, bottomExtent = boundary.level === levels - 1 ? bottomY : bottomY + LAYOUT.tickLength + this.labelOffset + 20 + (levels - 2 - boundary.level) * NESTED_SPLIT_TIER_GAP, bx = leafCenter(boundary.startLeaf) - bandHalf;
      this.line(
        {
          x1: bx,
          y1: topExtent,
          x2: bx,
          y2: bottomExtent,
          stroke: color,
          "stroke-width": 1,
          class: "facet-nested-group-separator"
        },
        g
      );
    }
  }
  /**
   * All tiers on one vertical side (left or right of the plot) — the
   * transposed counterpart of {@link renderStacked}, for horizontal bar
   * charts. Each tier is a column whose width fits its longest label
   * (unlike the horizontal case, where every tier is just one fixed-height
   * row regardless of label length).
   */
  renderStackedVertical(g, right) {
    let { scale, plot, leaves, keys } = this.cfg, color = this.cfg.lineColor ?? THEME.axis.lineColor, levels = leaves[0]?.length ?? 0, dir = right ? 1 : -1, baseX = right ? plot.x + plot.width : plot.x, leafCenter = (i) => scale.scale(keys[i]), bandHalf = scale.fullStep() / 2;
    this.line(
      { x1: baseX, y1: plot.y, x2: baseX, y2: plot.y + plot.height, stroke: color },
      g
    );
    let colWidths = nestedLevelWidths(leaves), offset = 0;
    for (let level = levels - 1; level >= 0; level--) {
      let w = colWidths[level], colStart = baseX + dir * (LAYOUT.tickLength + this.labelOffset + offset), segments = this.segmentsForLevel(leaves, level), labelX = colStart + dir * (w / 2);
      for (let seg of segments) {
        let cy = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2 + 4;
        this.text(
          seg.label,
          labelX,
          cy,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400"
          },
          g
        );
      }
      if (level < levels - 1)
        for (let s = 1; s < segments.length; s++) {
          let by = leafCenter(segments[s].startLeaf) - bandHalf;
          this.line(
            {
              x1: baseX,
              y1: by,
              x2: colStart + dir * w,
              y2: by,
              stroke: color,
              "stroke-width": 1
            },
            g
          );
        }
      offset += w;
    }
    let farEdge = baseX + dir * (LAYOUT.tickLength + this.labelOffset + offset), outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      let by = leafCenter(outer[s].startLeaf) - bandHalf;
      this.line(
        { x1: baseX, y1: by, x2: farEdge, y2: by, stroke: color, "stroke-width": 1 },
        g
      );
    }
  }
  /**
   * Split layout, vertical: innermost dimension as normal labels at the
   * left (nearest the plot), outer grouping dimensions stacked to the
   * right, full-width horizontal lines separating each top-level group.
   */
  renderSplitVertical(g) {
    let { scale, plot, leaves, keys } = this.cfg, color = this.cfg.lineColor ?? THEME.axis.lineColor, levels = leaves[0]?.length ?? 0, leafCenter = (i) => scale.scale(keys[i]), bandHalf = scale.fullStep() / 2, rightX = plot.x + plot.width, colWidths = nestedLevelWidths(leaves);
    this.line(
      { x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.height, stroke: color },
      g
    );
    let innerW = colWidths[levels - 1], innerSegments = this.segmentsForLevel(leaves, levels - 1);
    for (let seg of innerSegments) {
      let cy = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2 + 4;
      this.text(
        seg.label,
        plot.x - LAYOUT.tickLength - this.labelOffset - innerW / 2,
        cy,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        g
      );
    }
    let offset = 0;
    for (let level = levels - 2; level >= 0; level--) {
      let w = colWidths[level], labelX = rightX + LAYOUT.tickLength + this.labelOffset + offset + w / 2;
      for (let seg of this.segmentsForLevel(leaves, level)) {
        let cy = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2 + 4;
        this.text(
          seg.label,
          labelX,
          cy,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": level === 0 ? "600" : "400"
          },
          g
        );
      }
      offset += w;
    }
    let leftExtent = plot.x - LAYOUT.tickLength - this.labelOffset - innerW, rightExtent = rightX + LAYOUT.tickLength + this.labelOffset + offset, outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      let by = leafCenter(outer[s].startLeaf) - bandHalf;
      this.line(
        { x1: leftExtent, y1: by, x2: rightExtent, y2: by, stroke: color, "stroke-width": 1 },
        g
      );
    }
  }
  /**
   * Which of the innermost tier's segments to actually draw, thinning out
   * ("every Nth") when they'd otherwise overlap — the same idea the plain
   * axis uses for a cramped category axis. With an outer dimension, the
   * "every Nth" counter resets at each outer-group boundary so the kept/
   * skipped pattern reads the same within every group instead of sliding
   * across group lines, which would otherwise make it look like different,
   * arbitrary leaves are missing from each group.
   */
  thinnedInnerSegments(bandPx) {
    let { leaves } = this.cfg, levels = leaves[0]?.length ?? 0, inner = this.segmentsForLevel(leaves, levels - 1);
    if (bandPx <= 0 || inner.length < 2) return inner;
    let estW = inner.reduce((m, s) => Math.max(m, s.label.length), 0) * 6.2 + 6, step = estW > bandPx ? Math.ceil(estW / bandPx) : 1;
    if (step <= 1) return inner;
    if (levels <= 1) return inner.filter((_, i) => i % step === 0);
    let outer = this.segmentsForLevel(leaves, 0), outerIdx = 0;
    return inner.filter((seg) => {
      for (; outerIdx < outer.length - 1 && seg.startLeaf > outer[outerIdx].endLeaf; )
        outerIdx++;
      return (seg.startLeaf - outer[outerIdx].startLeaf) % step === 0;
    });
  }
  /**
   * Boundaries between adjacent leaves and the outermost dimension that
   * changes at each one. A separator uses that level to decide how far it
   * must extend into the nested label tiers.
   */
  categoryBoundaries() {
    let { leaves } = this.cfg, boundaries = [];
    for (let leaf = 1; leaf < leaves.length; leaf++) {
      let previous = leaves[leaf - 1], current = leaves[leaf], levels = Math.max(previous.length, current.length);
      for (let level = 0; level < levels; level++)
        if (previous[level] !== current[level]) {
          boundaries.push({ startLeaf: leaf, level });
          break;
        }
    }
    return boundaries;
  }
  /** Contiguous runs of leaves sharing the same prefix up to `level`. */
  segmentsForLevel(leaves, level) {
    let segments = [], prefixKey = (leaf) => leaf.slice(0, level + 1).join("\0"), start = 0;
    for (let i = 1; i <= leaves.length; i++)
      (i === leaves.length || prefixKey(leaves[i]) !== prefixKey(leaves[start])) && (segments.push({
        label: leaves[start][level],
        startLeaf: start,
        endLeaf: i - 1
      }), start = i);
    return segments;
  }
};

// src/core/tooltip.ts
var containerAnchors = /* @__PURE__ */ new WeakMap(), Tooltip = class {
  constructor(container, options) {
    this.container = container;
    this.options = options, this.el = document.createElement("div"), this.el.className = "facet-tooltip", Object.assign(this.el.style, {
      position: "absolute",
      pointerEvents: "none",
      padding: "6px 10px",
      font: "12px sans-serif",
      background: options.backgroundColor ?? "rgba(255,255,255,0.95)",
      border: `1px solid ${options.borderColor ?? "#ccc"}`,
      borderRadius: "4px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      color: options.color ?? "#333",
      whiteSpace: "nowrap",
      transition: "opacity 0.08s",
      opacity: "0",
      zIndex: "10"
    });
    let existingAnchor = containerAnchors.get(container);
    if (existingAnchor)
      existingAnchor.count++, this.anchorState = existingAnchor;
    else {
      let changed = getComputedStyle(container).position === "static";
      this.anchorState = {
        count: 1,
        changed,
        originalPosition: container.style.position
      }, containerAnchors.set(container, this.anchorState), changed && (container.style.position = "relative");
    }
    container.appendChild(this.el);
  }
  show(ctx, seriesTip) {
    this.options.enabled === !1 || seriesTip?.enabled === !1 || (this.el.innerHTML = this.content(ctx, seriesTip), this.el.style.opacity = "1");
  }
  move(clientX, clientY) {
    let rect = this.container.getBoundingClientRect(), w = this.el.offsetWidth, h = this.el.offsetHeight, gap = 12, cx = clientX - rect.left, cy = clientY - rect.top, x = cx + gap + w <= rect.width ? cx + gap : cx - gap - w, y = cy + gap + h <= rect.height ? cy + gap : cy - gap - h;
    x = Math.max(0, Math.min(x, rect.width - w)), y = Math.max(0, Math.min(y, rect.height - h)), this.el.style.left = `${x}px`, this.el.style.top = `${y}px`;
  }
  hide() {
    this.el.style.opacity = "0";
  }
  destroy() {
    this.el.remove(), this.anchorState.count--, this.anchorState.count === 0 && (this.anchorState.changed && (this.container.style.position = this.anchorState.originalPosition), containerAnchors.delete(this.container));
  }
  content(ctx, tip) {
    let opts = { ...this.options, ...tip };
    if (opts.formatter) return opts.formatter(ctx);
    let fmt = (v) => formatNumber(v, { decimals: opts.valueDecimals, prefix: opts.valuePrefix, suffix: opts.valueSuffix }), valueStr = fmt(ctx.y);
    if (ctx.points && ctx.points.length) {
      let rows = ctx.points.map(
        (r) => `<span style="color:${escapeHTML(r.color)}">\u25CF</span> ${escapeHTML(r.series)}: <b>${escapeHTML(fmt(r.y))}</b>`
      );
      return `<b>${escapeHTML(ctx.x)}</b><br/>${rows.join("<br/>")}`;
    }
    if (opts.format)
      return formatHTMLString(opts.format, {
        series: ctx.series,
        x: ctx.x,
        name: ctx.name ?? ctx.point?.name ?? ctx.x,
        y: ctx.y,
        yFormatted: valueStr,
        index: ctx.index,
        percentage: ctx.percentage,
        total: ctx.total,
        low: ctx.low,
        high: ctx.high,
        point: ctx.point,
        color: ctx.color
      });
    let head = `<b>${escapeHTML(ctx.x)}</b>`, bullet = `<span style="color:${escapeHTML(ctx.color)}">\u25CF</span>`, series = escapeHTML(ctx.series);
    if (ctx.box) {
      let b = ctx.box, row = (k, v) => `${k}: <b>${escapeHTML(fmt(v))}</b>`, rows = [
        row("Maximum", b.max),
        row("Upper quartile", b.q3),
        row("Median", b.median),
        row("Lower quartile", b.q1),
        row("Minimum", b.min)
      ];
      return b.outliers?.length && rows.push(`Outliers: <b>${b.outliers.map((v) => escapeHTML(fmt(v))).join(", ")}</b>`), `${head}<br/>${bullet} <b>${series}</b><br/>` + rows.join("<br/>");
    }
    return ctx.low !== void 0 && ctx.high !== void 0 ? `${head}<br/>${bullet} ${series}: <b>${escapeHTML(fmt(ctx.low))}</b> \u2013 <b>${escapeHTML(fmt(ctx.high))}</b>` : `${head}<br/>${bullet} ${series}: <b>${escapeHTML(valueStr)}</b>`;
  }
};

// src/core/legend.ts
var SWATCH = 12, DEFAULT_SYMBOL_PADDING = 6, DEFAULT_ITEM_GAP = 18, DEFAULT_ROW_GAP = 6, DEFAULT_TOP_MARGIN = 10, DEFAULT_BOTTOM_MARGIN = 22, DEFAULT_SIDE_MARGIN = 8, TOP_LEGEND_INSET = 12, CHAR_WIDTH_RATIO = 0.6, nonNegative = (value, fallback) => typeof value == "number" && Number.isFinite(value) && value >= 0 ? value : fallback, legendPadding = (options) => nonNegative(options.padding, 0), legendMargin = (options, placement, spacingScale = 1) => nonNegative(
  options.margin,
  (placement === "top" ? DEFAULT_TOP_MARGIN : placement === "bottom" ? DEFAULT_BOTTOM_MARGIN : DEFAULT_SIDE_MARGIN) * spacingScale
), Legend = class _Legend {
  constructor(cfg) {
    this.cfg = cfg;
  }
  static metrics(options) {
    let style = sanitizeStyle(options.itemStyle), fontSize = parseFloat(style["font-size"] ?? FONTS.legend["font-size"] ?? "12") || 12, lineHeight = Math.max(SWATCH, fontSize * 1.2);
    return {
      charWidth: fontSize * CHAR_WIDTH_RATIO,
      lineHeight,
      rowHeight: lineHeight + nonNegative(options.rowGap, DEFAULT_ROW_GAP)
    };
  }
  static itemWidths(items, options) {
    let { charWidth } = _Legend.metrics(options), symbolPadding = nonNegative(
      options.symbolPadding,
      DEFAULT_SYMBOL_PADDING
    ), itemGap = nonNegative(options.itemGap, DEFAULT_ITEM_GAP);
    return items.map(
      (it) => SWATCH + symbolPadding + it.label.length * charWidth + itemGap
    );
  }
  static rows(items, width, options) {
    let rows = [[]], rowWidth = 0;
    return _Legend.itemWidths(items, options).forEach((itemWidth, index) => {
      rowWidth + itemWidth > width && rows[rows.length - 1].length && (rows.push([]), rowWidth = 0), rows[rows.length - 1].push(index), rowWidth += itemWidth;
    }), rows;
  }
  /** Height needed for a wrapping horizontal legend. */
  static horizontalHeight(items, width, options, placement, spacingScale = 1) {
    let padding = legendPadding(options), contentWidth = Math.max(0, width - padding * 2);
    return (placement === "top" ? TOP_LEGEND_INSET : 0) + legendMargin(options, placement, spacingScale) + padding * 2 + _Legend.rows(items, contentWidth, options).length * _Legend.metrics(options).rowHeight;
  }
  /** Estimated width of a vertical legend column (for space reservation). */
  static verticalWidth(items, options, placement, spacingScale = 1) {
    let longest = items.reduce((m, it) => Math.max(m, it.label.length), 0), symbolPadding = nonNegative(
      options.symbolPadding,
      DEFAULT_SYMBOL_PADDING
    );
    return SWATCH + symbolPadding + longest * _Legend.metrics(options).charWidth + legendPadding(options) * 2 + legendMargin(options, placement, spacingScale);
  }
  render(parent) {
    if (this.cfg.options.enabled === !1 || !this.cfg.items.length) return;
    let g = this.cfg.renderer.group({ class: "facet-legend" }, parent);
    this.cfg.layout === "vertical" ? this.renderVertical(g) : this.renderHorizontal(g);
  }
  drawItem(g, it, index, x, y) {
    let { renderer, onToggle } = this.cfg, itemStyle = sanitizeStyle(this.cfg.options.itemStyle), symbolPadding = nonNegative(
      this.cfg.options.symbolPadding,
      DEFAULT_SYMBOL_PADDING
    ), { lineHeight } = _Legend.metrics(this.cfg.options), visibleFill = itemStyle.fill ?? FONTS.legend.fill, visibleTextDecoration = itemStyle["text-decoration"] ?? "none", centerY = y + lineHeight / 2, item = renderer.group({ class: "facet-legend-item", style: "cursor:pointer" }, g);
    renderer.create("rect", {
      x,
      y: centerY - SWATCH / 2,
      width: SWATCH,
      height: SWATCH,
      rx: 2,
      fill: it.visible ? it.color : THEME.legend.hiddenColor
    }, item);
    let label = renderer.text(it.label, x + SWATCH + symbolPadding, centerY, {
      ...FONTS.legend,
      ...itemStyle,
      fill: it.visible ? visibleFill : THEME.legend.hiddenColor,
      "text-decoration": it.visible ? visibleTextDecoration : "line-through",
      "dominant-baseline": itemStyle["dominant-baseline"] ?? "middle"
    }, item);
    label.style.userSelect = "none", item.addEventListener("click", () => onToggle(index));
  }
  renderHorizontal(g) {
    let { items, options, width, x: originX, y } = this.cfg, padding = legendPadding(options), contentWidth = Math.max(0, width - padding * 2), widths = _Legend.itemWidths(items, options), rows = _Legend.rows(items, contentWidth, options), { rowHeight } = _Legend.metrics(options);
    rows.forEach((row, r) => {
      let totalW = row.reduce((s, i) => s + widths[i], 0), startX = originX + padding;
      options.align === "right" ? startX = originX + padding + contentWidth - totalW : options.align !== "left" && (startX = originX + padding + (contentWidth - totalW) / 2);
      let cx = startX, rowY = y + padding + r * rowHeight;
      for (let i of row)
        this.drawItem(g, items[i], i, cx, rowY), cx += widths[i];
    });
  }
  renderVertical(g) {
    let { items, options, x, y } = this.cfg, padding = legendPadding(options), { rowHeight } = _Legend.metrics(options);
    items.forEach(
      (it, i) => this.drawItem(g, it, i, x + padding, y + padding + i * rowHeight)
    );
  }
};

// src/core/events.ts
var EventEmitter = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  on(event, listener) {
    let set = this.handlers.get(event);
    return set || (set = /* @__PURE__ */ new Set(), this.handlers.set(event, set)), set.add(listener), () => this.off(event, listener);
  }
  off(event, listener) {
    this.handlers.get(event)?.delete(listener);
  }
  emit(event, payload) {
    let set = this.handlers.get(event);
    if (set)
      for (let listener of set) listener(payload);
  }
  clear() {
    this.handlers.clear();
  }
};

// src/core/chart-options.ts
var SPARKLINE_DEFAULTS = {
  chart: { spacing: [2, 2, 2, 2] },
  xAxis: { visible: !1 },
  yAxis: { visible: !1 },
  legend: { enabled: !1 }
};
function resolveChartOptions(user) {
  let sparkline = user.chart?.type === "sparkline" ? SPARKLINE_DEFAULTS : {}, merged = merge(
    {},
    DEFAULT_OPTIONS,
    sparkline,
    user
  ), globalType = merged.chart?.type ?? "line", plot = merged.plotOptions ?? {};
  return merged.series = user.series.map((series) => {
    let type = series.type ?? globalType;
    return merge(
      {},
      plot.series ?? {},
      plot[type] ?? {},
      { type },
      series
    );
  }), merged;
}
function firstAxis(axis) {
  return Array.isArray(axis) ? axis[0] : axis;
}
function axisAt(axis, index) {
  return Array.isArray(axis) ? axis[index] ?? {} : index === 0 ? axis ?? {} : {};
}
function resolveCategories(series, xAxis) {
  let axis = firstAxis(xAxis);
  if (axis?.categories) return axis.categories;
  if (axis?.type === "category") {
    let seen2 = /* @__PURE__ */ new Set(), categories2 = [];
    return series.forEach(
      (entry) => entry.data.forEach((datum, index) => {
        let x = rawX(datum) ?? index, key = String(x);
        seen2.has(key) || (seen2.add(key), categories2.push(key));
      })
    ), categories2;
  }
  if (series.every(
    (entry) => entry.data.every(
      (datum) => typeof datum == "number" || Array.isArray(datum) && typeof datum[0] == "number"
    )
  )) return;
  let seen = /* @__PURE__ */ new Set(), categories = [];
  for (let entry of series)
    for (let datum of entry.data) {
      let x = rawX(datum);
      x !== void 0 && !seen.has(String(x)) && (seen.add(String(x)), categories.push(String(x)));
    }
  return categories.length ? categories : void 0;
}
function rawX(datum) {
  if (datum !== null) {
    if (Array.isArray(datum)) return datum[0];
    if (typeof datum == "object") {
      let value = datum;
      return value.x ?? value.name;
    }
  }
}

// src/core/chart-export.ts
function serializeSVG(renderer, width, height) {
  let clone = renderer.root.cloneNode(!0), originals = renderer.root.querySelectorAll(
    "foreignObject.facet-boost"
  ), copies = clone.querySelectorAll(
    "foreignObject.facet-boost"
  );
  return originals.forEach((source, i) => {
    let canvas = source.querySelector("canvas"), copy = copies[i];
    if (!(!canvas || !copy))
      try {
        let image = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "image"
        );
        for (let attr of ["x", "y", "width", "height", "class", "clip-path"])
          copy.hasAttribute(attr) && image.setAttribute(attr, copy.getAttribute(attr));
        image.setAttribute("href", canvas.toDataURL("image/png")), copy.replaceWith(image);
      } catch {
      }
  }), clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"), clone.setAttribute("width", String(width)), clone.setAttribute("height", String(height)), new XMLSerializer().serializeToString(clone);
}
function rasterizePNG(svg, width, height, backgroundColor, scale = 2) {
  return new Promise((resolve) => {
    let source = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), image = new Image();
    image.onload = () => {
      let canvas = document.createElement("canvas");
      canvas.width = width * scale, canvas.height = height * scale;
      let context = canvas.getContext("2d");
      if (!context) return resolve(null);
      context.fillStyle = backgroundColor, context.fillRect(0, 0, canvas.width, canvas.height), context.drawImage(image, 0, 0, canvas.width, canvas.height), canvas.toBlob(resolve, "image/png");
    }, image.onerror = () => resolve(null), image.src = source;
  });
}
function downloadBlob(blob, filename) {
  let url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url, anchor.download = filename, anchor.click(), setTimeout(() => URL.revokeObjectURL(url), 1e3);
}

// src/core/stacking.ts
var pointKey = (p) => `${typeof p.x}:${String(p.x)}`;
function computeStacks(visible) {
  for (let s of visible)
    for (let p of s.points)
      p.stackLow = void 0, p.stackHigh = void 0;
  let groups = /* @__PURE__ */ new Map();
  for (let s of visible) {
    if (!s.options.stacking || !s.capabilities().stackable) continue;
    let key = `${s.options.yAxis ?? 0}:${s.options.stack ?? "default"}`, group = groups.get(key) ?? [];
    group.push(s), groups.set(key, group);
  }
  for (let group of groups.values()) {
    let mode = group[0].options.stacking, keys = /* @__PURE__ */ new Set(), pointsBySeries = /* @__PURE__ */ new Map();
    for (let s of group) {
      let byKey = /* @__PURE__ */ new Map();
      for (let p of s.points) {
        let key = pointKey(p);
        keys.add(key), byKey.set(key, p);
      }
      pointsBySeries.set(s, byKey);
    }
    for (let key of keys) {
      let positiveBase = 0, negativeBase = 0, total = 0;
      if (mode === "percent")
        for (let s of group)
          total += Math.abs(pointsBySeries.get(s)?.get(key)?.y ?? 0);
      for (let s of group) {
        let point = pointsBySeries.get(s)?.get(key);
        if (!point || point.y === void 0) continue;
        let value = point.y;
        mode === "percent" && total > 0 && (value = value / total * 100), value >= 0 ? (point.stackLow = positiveBase, point.stackHigh = positiveBase + value, positiveBase += value) : (point.stackHigh = negativeBase, point.stackLow = negativeBase + value, negativeBase += value);
      }
    }
  }
}

// src/core/series-state.ts
function captureSeriesState(series) {
  return series.map((s) => ({
    visible: s.visible,
    hiddenPoints: new Set(s.hiddenPoints)
  }));
}
function restoreSeriesState(series, state) {
  series.forEach((s, i) => {
    let previous = state[i];
    previous && (s.visible = previous.visible, s.hiddenPoints = previous.hiddenPoints);
  });
}

// src/core/validation.ts
var isRecord = (value) => typeof value == "object" && value !== null && !Array.isArray(value), describe = (value) => {
  try {
    let json = JSON.stringify(value);
    return json === void 0 ? String(value) : json;
  } catch {
    return String(value);
  }
}, numberAt = (record, key) => typeof record[key] == "number" ? record[key] : void 0, dataValues = (data) => {
  let values = [];
  for (let point of data)
    if (typeof point == "number") values.push(point);
    else if (Array.isArray(point))
      for (let value of point.slice(1))
        typeof value == "number" && values.push(value);
    else if (isRecord(point))
      for (let key of ["y", "low", "high", "value", "open", "close"])
        typeof point[key] == "number" && values.push(point[key]);
  return values;
}, pointX = (point, index) => Array.isArray(point) ? point[0] : isRecord(point) ? point.x ?? point.name ?? index : index, pointValue = (point) => {
  if (typeof point == "number") return point;
  if (Array.isArray(point))
    return typeof point[1] == "number" ? point[1] : void 0;
  if (isRecord(point))
    return typeof point.y == "number" ? point.y : typeof point.value == "number" ? point.value : void 0;
}, ChartValidationError = class extends Error {
  constructor(issues) {
    super(
      `FacetViz configuration is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`
    ), this.name = "ChartValidationError", this.issues = issues;
  }
};
function validateChartOptions(options) {
  let issues = [], add = (code, severity, path, message, suggestion) => issues.push({ code, severity, path, message, suggestion });
  if (!isRecord(options))
    return add("config.object", "error", "$", "Configuration must be an object."), result(issues);
  let chart = options.chart;
  chart !== void 0 && !isRecord(chart) && add("chart.object", "error", "chart", "chart must be an object.");
  let chartRecord = isRecord(chart) ? chart : {}, validationOption = options.validation;
  validationOption !== void 0 && typeof validationOption != "boolean" && !isRecord(validationOption) && add("validation.object", "error", "validation", "validation must be a boolean or an options object."), isRecord(validationOption) && (validationOption.mode !== void 0 && !["warn", "error", "silent"].includes(String(validationOption.mode)) && add("validation.mode", "error", "validation.mode", "Validation mode must be warn, error, or silent."), validationOption.onIssue !== void 0 && typeof validationOption.onIssue != "function" && add("validation.on_issue.function", "error", "validation.onIssue", "onIssue must be a function."));
  let globalType = chartRecord.type ?? "line";
  (typeof globalType != "string" || !isSeriesTypeRegistered(globalType)) && add(
    "chart.type.unknown",
    "error",
    "chart.type",
    `Unknown chart type ${describe(globalType)}.`,
    "Use a built-in type or call registerSeriesType() before validation."
  );
  for (let dimension of ["width", "height"]) {
    let value = chartRecord[dimension];
    value !== void 0 && (typeof value != "number" || !Number.isFinite(value) || value <= 0) && add(
      `chart.${dimension}.positive`,
      "error",
      `chart.${dimension}`,
      `${dimension} must be a positive finite number.`
    );
  }
  let polarInnerSize = chartRecord.polarInnerSize;
  polarInnerSize !== void 0 && !(typeof polarInnerSize == "number" && Number.isFinite(polarInnerSize) && polarInnerSize >= 0 || typeof polarInnerSize == "string" && /^\s*(?:\d+(?:\.\d+)?|\.\d+)%\s*$/.test(polarInnerSize) && parseFloat(polarInnerSize) >= 0 && parseFloat(polarInnerSize) < 100) && add(
    "chart.polar_inner_size.valid",
    "error",
    "chart.polarInnerSize",
    "polarInnerSize must be a non-negative pixel number or a percentage below 100%."
  ), chartRecord.polarGridLineMode !== void 0 && !["spoke", "sector"].includes(String(chartRecord.polarGridLineMode)) && add(
    "chart.polar_grid_line_mode.unknown",
    "error",
    "chart.polarGridLineMode",
    "polarGridLineMode must be spoke or sector."
  ), validateTitle(options.title, "title", add), validateTitle(options.subtitle, "subtitle", add), validateLegend(options.legend, add), validateAnnotations(options.annotations, add), validateChartTexts(options.texts, add), validateResponsive(options.responsive, add);
  for (let [path, palette] of [
    ["colors", options.colors],
    ["chart.colors", chartRecord.colors]
  ])
    palette !== void 0 && (!Array.isArray(palette) || palette.length === 0) ? add("colors.non_empty", "error", path, "A color palette must be a non-empty array.") : Array.isArray(palette) && palette.some((color) => typeof color != "string" || color.trim() === "") && add("colors.string", "error", path, "Every palette entry must be a non-empty color string.");
  let xAxes = validateAxes(options.xAxis, "xAxis", add), yAxes = validateAxes(options.yAxis, "yAxis", add), series = options.series;
  if (!Array.isArray(series))
    return add("series.required", "error", "series", "series must be an array."), result(issues);
  series.length === 0 && add("series.empty", "warning", "series", "The chart has no series to render.");
  let drilldownIds = /* @__PURE__ */ new Set(), drilldown = options.drilldown;
  return drilldown !== void 0 && (!isRecord(drilldown) || !Array.isArray(drilldown.series)) && add("drilldown.series.required", "error", "drilldown.series", "drilldown.series must be an array."), (isRecord(drilldown) && Array.isArray(drilldown.series) ? drilldown.series : []).forEach((entry, index) => {
    !isRecord(entry) || typeof entry.id != "string" || entry.id === "" ? add("drilldown.id.required", "error", `drilldown.series[${index}].id`, "Drilldown series require a non-empty id.") : drilldownIds.has(entry.id) ? add("drilldown.id.duplicate", "error", `drilldown.series[${index}].id`, `Duplicate drilldown id ${describe(entry.id)}.`) : drilldownIds.add(entry.id);
  }), series.forEach((entry, seriesIndex) => {
    let base = `series[${seriesIndex}]`;
    if (!isRecord(entry)) {
      add("series.object", "error", base, "Each series must be an object.");
      return;
    }
    let type = entry.type ?? globalType;
    if (typeof type != "string" || !isSeriesTypeRegistered(type)) {
      add(
        "series.type.unknown",
        "error",
        `${base}.type`,
        `Unknown series type ${describe(type)}.`,
        "Use a built-in type or register the custom type first."
      );
      return;
    }
    chartRecord.polar === !0 && ![
      "line",
      "spline",
      "step",
      "area",
      "areaspline",
      "scatter",
      "jitter",
      "column",
      "dumbbell"
    ].includes(String(type)) && add(
      "chart.polar.series.unsupported",
      "warning",
      `${base}.type`,
      `${type} does not support chart.polar and will not be rendered in the polar frame.`,
      "Use line, spline, step, area, areaspline, scatter, jitter, column, or dumbbell."
    );
    let data = entry.data;
    if (!Array.isArray(data)) {
      add("series.data.required", "error", `${base}.data`, "Series data must be an array.");
      return;
    }
    data.length === 0 && add("series.data.empty", "warning", `${base}.data`, "This series has no data points.");
    let yAxisIndex = entry.yAxis ?? 0, validYAxisIndex = typeof yAxisIndex == "number" && Number.isInteger(yAxisIndex) && yAxisIndex >= 0 && yAxisIndex <= 1 && yAxisIndex < yAxes.length;
    validYAxisIndex || add("series.y_axis.index", "error", `${base}.yAxis`, `yAxis index must reference one of ${yAxes.length} configured axes.`), (yAxes[validYAxisIndex ? yAxisIndex : 0] ?? {}).type === "log" && dataValues(data).some((value) => value <= 0) && add("axis.log.non_positive", "error", `${base}.data`, "Logarithmic axes require strictly positive values.");
    let xAxisIndex = entry.xAxis ?? 0, validXAxisIndex = typeof xAxisIndex == "number" && Number.isInteger(xAxisIndex) && xAxisIndex >= 0 && xAxisIndex <= 1 && xAxisIndex < xAxes.length;
    if (validXAxisIndex || add("series.x_axis.index", "error", `${base}.xAxis`, `xAxis index must reference one of ${xAxes.length} configured axes.`), (xAxes[validXAxisIndex ? xAxisIndex : 0] ?? {}).type === "log" && data.some((point, index) => {
      let x = pointX(point, index);
      return typeof x == "number" && x <= 0;
    }) && add("axis.log.non_positive_x", "error", `${base}.data`, "Logarithmic x-axes require strictly positive x values."), type === "histogram" && entry.bins !== void 0 && (typeof entry.bins != "number" || !Number.isSafeInteger(entry.bins) || entry.bins <= 0) && add("histogram.bins.positive_integer", "error", `${base}.bins`, "Histogram bins must be a positive integer."), type === "radialbar") {
      let startValue = entry.startAngle, endValue = entry.endAngle, startValid = startValue === void 0 || typeof startValue == "number" && Number.isFinite(startValue), endValid = endValue === void 0 || typeof endValue == "number" && Number.isFinite(endValue);
      if (startValid || add("radialbar.start_angle.finite", "error", `${base}.startAngle`, "startAngle must be a finite number of degrees."), endValid || add("radialbar.end_angle.finite", "error", `${base}.endAngle`, "endAngle must be a finite number of degrees."), startValid && endValid) {
        let sweep = (endValue ?? 180) - (startValue ?? -90);
        (sweep <= 0 || sweep > 360) && add(
          "radialbar.angle_sweep.range",
          "error",
          base,
          "startAngle and endAngle must define a positive sweep of at most 360 degrees."
        );
      }
    }
    if (["pie", "donut", "funnel", "radialbar", "sunburst"].includes(type) && data.some((point) => (pointValue(point) ?? 1) < 0) && add("series.value.non_negative", "error", `${base}.data`, `${type} values cannot be negative.`), ["arearange", "areasplinerange", "columnrange", "errorbar"].includes(type) && validateRanges(data, base, add), type === "boxplot" && validateBoxplots(data, base, add), type === "candlestick" && validateCandlesticks(data, base, add), type === "gantt" && validateGantt(data, base, add), type === "sankey" && validateSankey(data, base, add), (type === "treegraph" || type === "sunburst") && validateHierarchy(data, base, add), type === "gauge") {
      let min = numberAt(entry, "min") ?? 0, max = numberAt(entry, "max") ?? 100;
      min >= max && add("gauge.range.order", "error", base, "Gauge min must be smaller than max."), data.forEach((point, pointIndex) => {
        let value = pointValue(point);
        value !== void 0 && (value < min || value > max) && add("gauge.value.outside_range", "warning", `${base}.data[${pointIndex}]`, `Gauge value ${value} is outside ${min}\u2013${max} and will be clamped.`);
      });
    }
    data.forEach((point, pointIndex) => {
      isRecord(point) && typeof point.drilldown == "string" && !drilldownIds.has(point.drilldown) && add("drilldown.reference.missing", "warning", `${base}.data[${pointIndex}].drilldown`, `No drilldown series has id ${describe(point.drilldown)}.`);
    });
  }), result(issues);
}
function result(issues) {
  let errors = issues.filter((issue) => issue.severity === "error"), warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings, issues };
}
function validateAxes(value, path, add) {
  let axes = Array.isArray(value) ? value : [value ?? {}];
  return axes.length > 2 && add(
    "axis.count.maximum",
    "error",
    path,
    "FacetViz supports at most two axes per direction.",
    "Keep a primary axis at index 0 and an optional secondary axis at index 1."
  ), axes.map((axis, index) => {
    let axisPath = Array.isArray(value) ? `${path}[${index}]` : path;
    if (!isRecord(axis))
      return add("axis.object", "error", axisPath, "Axis configuration must be an object."), {};
    axis.min !== void 0 && typeof axis.min != "number" && add("axis.min.number", "error", `${axisPath}.min`, "Axis min must be a number."), axis.max !== void 0 && typeof axis.max != "number" && add("axis.max.number", "error", `${axisPath}.max`, "Axis max must be a number."), typeof axis.min == "number" && typeof axis.max == "number" && axis.min >= axis.max && add("axis.range.order", "error", axisPath, "Axis min must be smaller than max."), axis.type !== void 0 && !["linear", "log", "category", "datetime"].includes(String(axis.type)) && add("axis.type.unknown", "error", `${axisPath}.type`, `Unknown axis type ${describe(axis.type)}.`);
    for (let key of ["gridLineWidth", "minorGridLineWidth"]) {
      let width = axis[key];
      width !== void 0 && (typeof width != "number" || !Number.isFinite(width) || width < 0) && add(
        "axis.grid_line_width.non_negative",
        "error",
        `${axisPath}.${key}`,
        `${key} must be a non-negative finite number.`
      );
    }
    axis.minorTickInterval !== void 0 && axis.minorTickInterval !== "auto" && (typeof axis.minorTickInterval != "number" || !Number.isFinite(axis.minorTickInterval) || axis.minorTickInterval <= 0) && add(
      "axis.minor_tick_interval.positive",
      "error",
      `${axisPath}.minorTickInterval`,
      "minorTickInterval must be 'auto' or a positive finite number."
    );
    for (let key of ["gridLineDashStyle", "minorGridLineDashStyle"])
      axis[key] !== void 0 && typeof axis[key] != "string" && add(
        "axis.grid_line_dash_style.string",
        "error",
        `${axisPath}.${key}`,
        `${key} must be an SVG dash-array string.`
      );
    return axis.alternateGridColor !== void 0 && typeof axis.alternateGridColor != "string" && add(
      "axis.alternate_grid_color.string",
      "error",
      `${axisPath}.alternateGridColor`,
      "alternateGridColor must be a CSS colour string."
    ), validateTitle(axis.title, `${axisPath}.title`, add, !0), isRecord(axis.labels) && (axis.labels.position !== void 0 && !["outer", "inner"].includes(String(axis.labels.position)) && add(
      "axis.labels.position.unknown",
      "error",
      `${axisPath}.labels.position`,
      "Polar label position must be outer or inner."
    ), axis.labels.offset !== void 0 && (typeof axis.labels.offset != "number" || !Number.isFinite(axis.labels.offset) || axis.labels.offset < 0) && add(
      "axis.labels.offset.non_negative",
      "error",
      `${axisPath}.labels.offset`,
      "Label offset must be a non-negative number."
    ), axis.labels.step !== void 0 && (typeof axis.labels.step != "number" || !Number.isSafeInteger(axis.labels.step) || axis.labels.step <= 0) && add(
      "axis.labels.step.positive_integer",
      "error",
      `${axisPath}.labels.step`,
      "Label step must be a positive integer."
    ), axis.labels.maxWidth !== void 0 && (typeof axis.labels.maxWidth != "number" || axis.labels.maxWidth <= 0) && add(
      "axis.labels.max_width.positive",
      "error",
      `${axisPath}.labels.maxWidth`,
      "Label maxWidth must be a positive number."
    ), axis.labels.autoRotation !== void 0 && (!Array.isArray(axis.labels.autoRotation) || axis.labels.autoRotation.some((value2) => typeof value2 != "number")) && add(
      "axis.labels.auto_rotation.numbers",
      "error",
      `${axisPath}.labels.autoRotation`,
      "autoRotation must be an array of numeric angles."
    )), axis;
  });
}
function validateTitle(value, path, add, axis = !1) {
  if (value !== void 0) {
    if (!isRecord(value)) {
      add("title.object", "error", path, "Title configuration must be an object.");
      return;
    }
    value.enabled !== void 0 && typeof value.enabled != "boolean" && add("title.enabled.boolean", "error", `${path}.enabled`, "enabled must be a boolean."), axis && value.position !== void 0 && !["outer", "center"].includes(String(value.position)) && add(
      "axis.title.position.unknown",
      "error",
      `${path}.position`,
      "Polar axis-title position must be outer or center."
    );
    for (let key of axis ? ["margin", "offset"] : ["margin", "offsetY"]) {
      let item = value[key];
      item !== void 0 && (typeof item != "number" || !Number.isFinite(item)) ? add("title.offset.number", "error", `${path}.${key}`, `${key} must be a finite number.`) : key === "margin" && typeof item == "number" && item < 0 && add(
        "title.margin.non_negative",
        "error",
        `${path}.${key}`,
        "margin must be non-negative."
      );
    }
  }
}
function validateLegend(value, add) {
  if (value !== void 0) {
    if (!isRecord(value)) {
      add(
        "legend.object",
        "error",
        "legend",
        "Legend configuration must be an object."
      );
      return;
    }
    for (let key of [
      "margin",
      "padding",
      "symbolPadding",
      "itemGap",
      "rowGap"
    ]) {
      let item = value[key];
      item !== void 0 && (typeof item != "number" || !Number.isFinite(item) || item < 0) && add(
        "legend.spacing.non_negative",
        "error",
        `legend.${key}`,
        `${key} must be a non-negative finite number.`
      );
    }
    for (let key of ["offsetX", "offsetY"]) {
      let item = value[key];
      item !== void 0 && (typeof item != "number" || !Number.isFinite(item)) && add(
        "legend.offset.number",
        "error",
        `legend.${key}`,
        `${key} must be a finite number.`
      );
    }
  }
}
function validateAnnotations(value, add) {
  if (value !== void 0) {
    if (!Array.isArray(value)) {
      add("annotations.array", "error", "annotations", "annotations must be an array.");
      return;
    }
    value.forEach((annotation, index) => {
      let path = `annotations[${index}]`;
      if (!isRecord(annotation)) {
        add("annotation.object", "error", path, "Each annotation must be an object.");
        return;
      }
      annotation.shape !== void 0 && !["label", "callout", "circle"].includes(String(annotation.shape)) && add("annotation.shape.unknown", "error", `${path}.shape`, "Unknown annotation shape."), annotation.x !== void 0 && typeof annotation.x != "number" && typeof annotation.x != "string" && add("annotation.x.value", "error", `${path}.x`, "Annotation x must be a number or string."), annotation.y !== void 0 && typeof annotation.y != "number" && add("annotation.y.number", "error", `${path}.y`, "Annotation y must be a number.");
      for (let axis of ["xAxis", "yAxis"])
        annotation[axis] !== void 0 && annotation[axis] !== 0 && annotation[axis] !== 1 && add(
          "annotation.axis.index",
          "error",
          `${path}.${axis}`,
          `${axis} must be 0 or 1.`
        );
    });
  }
}
function validateChartTexts(value, add) {
  if (value !== void 0) {
    if (!Array.isArray(value)) {
      add("texts.array", "error", "texts", "texts must be an array.");
      return;
    }
    value.forEach((item, index) => {
      let path = `texts[${index}]`;
      if (!isRecord(item)) {
        add("text.object", "error", path, "Each chart text item must be an object.");
        return;
      }
      (typeof item.text != "string" || item.text.length === 0) && add("text.text.required", "error", `${path}.text`, "Chart text requires a non-empty text string."), item.enabled !== void 0 && typeof item.enabled != "boolean" && add("text.enabled.boolean", "error", `${path}.enabled`, "enabled must be a boolean."), item.align !== void 0 && !["left", "center", "right"].includes(String(item.align)) && add("text.align.unknown", "error", `${path}.align`, "align must be left, center, or right."), item.verticalAlign !== void 0 && !["top", "center", "bottom"].includes(String(item.verticalAlign)) && add(
        "text.vertical_align.unknown",
        "error",
        `${path}.verticalAlign`,
        "verticalAlign must be top, center, or bottom."
      );
      for (let key of [
        "offsetX",
        "offsetY",
        "lineHeight",
        "rotation"
      ]) {
        let number = item[key];
        number !== void 0 && (typeof number != "number" || !Number.isFinite(number)) ? add("text.number.finite", "error", `${path}.${key}`, `${key} must be a finite number.`) : key === "lineHeight" && typeof number == "number" && number <= 0 && add("text.line_height.positive", "error", `${path}.${key}`, "lineHeight must be positive.");
      }
    });
  }
}
function validateResponsive(value, add) {
  if (value !== void 0) {
    if (!Array.isArray(value)) {
      add("responsive.array", "error", "responsive", "responsive must be an array.");
      return;
    }
    value.forEach((rule, index) => {
      let path = `responsive[${index}]`;
      if (!isRecord(rule)) {
        add("responsive.rule.object", "error", path, "Each responsive rule must be an object.");
        return;
      }
      if (isRecord(rule.condition) || add(
        "responsive.condition.object",
        "error",
        `${path}.condition`,
        "Responsive rules require a condition object."
      ), isRecord(rule.options) || add(
        "responsive.options.object",
        "error",
        `${path}.options`,
        "Responsive rules require an options object."
      ), isRecord(rule.condition))
        for (let key of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
          let limit = rule.condition[key];
          limit !== void 0 && (typeof limit != "number" || !Number.isFinite(limit) || limit < 0) && add(
            "responsive.condition.non_negative",
            "error",
            `${path}.condition.${key}`,
            `${key} must be a non-negative finite number.`
          );
        }
    });
  }
}
function validateRanges(data, base, add) {
  data.forEach((point, index) => {
    let low = Array.isArray(point) ? point[1] : isRecord(point) ? point.low : void 0, high = Array.isArray(point) ? point[2] : isRecord(point) ? point.high : void 0;
    typeof low != "number" || typeof high != "number" ? add("range.low_high.required", "error", `${base}.data[${index}]`, "Range points require numeric low and high values.") : low > high && add("range.order", "error", `${base}.data[${index}]`, "Range point low cannot exceed high.");
  });
}
function validateBoxplots(data, base, add) {
  data.forEach((point, index) => {
    if (!isRecord(point)) {
      add("boxplot.shape", "error", `${base}.data[${index}]`, "Boxplot points require min, q1, median, q3, and max.");
      return;
    }
    let values = [point.min, point.q1, point.median, point.q3, point.max];
    values.every((value) => typeof value == "number") ? values.some((value, i) => i > 0 && Number(values[i - 1]) > Number(value)) && add("boxplot.order", "error", `${base}.data[${index}]`, "Boxplot values must satisfy min \u2264 q1 \u2264 median \u2264 q3 \u2264 max.") : add("boxplot.shape", "error", `${base}.data[${index}]`, "Boxplot points require numeric min, q1, median, q3, and max.");
  });
}
function validateCandlesticks(data, base, add) {
  data.forEach((point, index) => {
    if (!isRecord(point)) {
      add("candlestick.shape", "error", `${base}.data[${index}]`, "Candlestick points require open, high, low, and close.");
      return;
    }
    [point.open, point.high, point.low, point.close].every((value) => typeof value == "number") ? (Number(point.high) < Math.max(Number(point.open), Number(point.close), Number(point.low)) || Number(point.low) > Math.min(Number(point.open), Number(point.close), Number(point.high))) && add("candlestick.order", "error", `${base}.data[${index}]`, "high must be the largest OHLC value and low the smallest.") : add("candlestick.shape", "error", `${base}.data[${index}]`, "Candlestick points require numeric open, high, low, and close.");
  });
}
function validateGantt(data, base, add) {
  data.forEach((point, index) => {
    !isRecord(point) || typeof point.start != "number" || typeof point.end != "number" ? add("gantt.start_end.required", "error", `${base}.data[${index}]`, "Gantt points require numeric start and end values.") : point.end <= point.start && add("gantt.range.order", "error", `${base}.data[${index}]`, "Gantt end must be greater than start.");
  });
}
function validateSankey(data, base, add) {
  let edges = [];
  data.forEach((point, index) => {
    if (!isRecord(point) || typeof point.from != "string" || !point.from || typeof point.to != "string" || !point.to)
      add("sankey.link.required", "error", `${base}.data[${index}]`, "Sankey links require non-empty from and to ids.");
    else {
      edges.push([point.from, point.to]);
      let weight = point.weight ?? point.y ?? 1;
      (typeof weight != "number" || weight <= 0) && add("sankey.weight.positive", "error", `${base}.data[${index}].weight`, "Sankey link weight must be positive.");
    }
  });
  let visiting = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set(), graph = /* @__PURE__ */ new Map();
  for (let [from, to] of edges) graph.set(from, [...graph.get(from) ?? [], to]);
  let cyclic = (node) => {
    if (visiting.has(node)) return !0;
    if (visited.has(node)) return !1;
    visiting.add(node);
    for (let next of graph.get(node) ?? []) if (cyclic(next)) return !0;
    return visiting.delete(node), visited.add(node), !1;
  };
  [...graph.keys()].some(cyclic) && add("sankey.cycle", "error", `${base}.data`, "Sankey links must form an acyclic graph.");
}
function validateHierarchy(data, base, add) {
  let ids = /* @__PURE__ */ new Set();
  data.forEach((point, index) => {
    if (!isRecord(point)) return;
    let id = point.id ?? point.name;
    if (id === void 0) return;
    let key = String(id);
    ids.has(key) && add("hierarchy.id.duplicate", "error", `${base}.data[${index}].id`, `Duplicate hierarchy id ${JSON.stringify(key)}.`), ids.add(key);
  }), data.forEach((point, index) => {
    isRecord(point) && point.parent !== void 0 && !ids.has(String(point.parent)) && add("hierarchy.parent.missing", "warning", `${base}.data[${index}].parent`, `Parent ${JSON.stringify(String(point.parent))} does not exist and this node will become a root.`);
  });
}
function enforceConfiguredValidation(options) {
  let configured = options.validation;
  if (!configured) return;
  let validation = validateChartOptions(options), config = configured === !0 ? {} : configured;
  for (let issue of validation.issues) config.onIssue?.(issue);
  let mode = ["warn", "error", "silent"].includes(config.mode ?? "") ? config.mode : "warn";
  if (mode === "error" && validation.errors.length)
    throw new ChartValidationError(validation.errors);
  if (mode === "warn")
    for (let issue of validation.issues)
      console.warn(`[FacetViz:${issue.code}] ${issue.path}: ${issue.message}`);
}

// src/core/annotations.ts
function renderAnnotations(ctx) {
  let items = ctx.annotations.filter(
    (annotation) => (annotation.zIndex ?? "above") === ctx.layer
  );
  if (!items.length) return;
  let group = ctx.renderer.group(
    { class: `facet-annotations facet-annotations-${ctx.layer}` },
    ctx.renderer.root
  );
  for (let annotation of items) {
    let xScale = annotation.xAxis === 1 && ctx.xScale2 ? ctx.xScale2 : ctx.xScale, yScale = annotation.yAxis === 1 && ctx.yScale2 ? ctx.yScale2 : ctx.yScale, anchor = {
      x: annotation.x === void 0 ? ctx.plot.x + ctx.plot.width / 2 : xScale.scale(annotation.x),
      y: annotation.y === void 0 ? ctx.plot.y + ctx.plot.height / 2 : yScale.scale(annotation.y)
    };
    ctx.project && annotation.x !== void 0 && annotation.y !== void 0 && (anchor = ctx.project(xScale.scale(annotation.x), yScale.scale(annotation.y)));
    let color = annotation.color ?? "#334155", radius = annotation.radius ?? 4, shape = annotation.shape ?? (annotation.text ? "callout" : "circle"), labelX = anchor.x + (annotation.dx ?? 16), labelY = anchor.y + (annotation.dy ?? -16);
    if (shape === "circle" ? ctx.renderer.create(
      "circle",
      {
        cx: anchor.x,
        cy: anchor.y,
        r: radius,
        fill: annotation.backgroundColor ?? "none",
        stroke: annotation.borderColor ?? color,
        "stroke-width": annotation.borderWidth ?? 2,
        class: "facet-annotation-anchor"
      },
      group
    ) : ctx.renderer.create(
      "circle",
      {
        cx: anchor.x,
        cy: anchor.y,
        r: radius,
        fill: color,
        stroke: "#fff",
        "stroke-width": 1,
        class: "facet-annotation-anchor"
      },
      group
    ), !annotation.text) continue;
    shape === "callout" && ctx.renderer.create(
      "line",
      {
        x1: anchor.x,
        y1: anchor.y,
        x2: labelX,
        y2: labelY,
        stroke: annotation.borderColor ?? color,
        "stroke-width": annotation.borderWidth ?? 1,
        class: "facet-annotation-connector"
      },
      group
    );
    let style = {
      ...FONTS.axisLabel,
      fill: color,
      ...sanitizeStyle(annotation.style)
    }, padding = annotation.padding ?? 5, metrics = ctx.renderer.measureText(annotation.text, style), box = {
      x: labelX - padding,
      y: labelY - metrics.height + 1 - padding,
      width: metrics.width + padding * 2,
      height: metrics.height + padding * 2
    };
    ctx.renderer.create(
      "rect",
      {
        ...box,
        rx: 4,
        fill: annotation.backgroundColor ?? "rgba(255,255,255,0.92)",
        stroke: annotation.borderColor ?? color,
        "stroke-width": annotation.borderWidth ?? 1,
        class: "facet-annotation-label-box"
      },
      group
    ), ctx.renderer.text(
      annotation.text,
      labelX,
      labelY,
      {
        ...style,
        "dominant-baseline": "auto",
        class: "facet-annotation-label"
      },
      group
    );
  }
}

// src/core/chart-text.ts
function resolveChartTextStyle(item, textScale) {
  let style = {
    ...FONTS.dataLabel,
    ...item.color ? { fill: item.color } : {},
    ...sanitizeStyle(item.style)
  }, configured = item.style?.fontSize, size = parseFloat(String(configured ?? ""));
  if (Number.isFinite(size)) {
    let unit = /[a-z%]+$/i.exec(String(configured))?.[0] ?? "px";
    style["font-size"] = `${size * textScale}${unit}`;
  }
  return style;
}
function renderChartTexts(ctx) {
  let items = ctx.texts.filter((item) => item.enabled !== !1);
  if (!items.length) return;
  let layer = ctx.renderer.group(
    { class: "facet-chart-texts" },
    ctx.renderer.root
  );
  for (let item of items) {
    if (!item.text) continue;
    let align = item.align ?? "left", verticalAlign = item.verticalAlign ?? "top", x = (align === "left" ? 0 : align === "right" ? ctx.width : ctx.width / 2) + (item.offsetX ?? 0) * ctx.textScale, y = (verticalAlign === "top" ? 0 : verticalAlign === "bottom" ? ctx.height : ctx.height / 2) + (item.offsetY ?? 0) * ctx.textScale, style = resolveChartTextStyle(item, ctx.textScale), fontSize = parseFloat(style["font-size"] ?? "11") || 11, lineHeight = item.lineHeight != null ? item.lineHeight * ctx.textScale : fontSize * 1.2, lines = item.text.split(`
`), textHeight = fontSize + lineHeight * (lines.length - 1), top = verticalAlign === "top" ? y : verticalAlign === "bottom" ? y - textHeight : y - textHeight / 2, className = item.className ? ` ${item.className}` : "", group = ctx.renderer.group(
      {
        class: `facet-chart-text${className}`,
        transform: item.rotation ? `rotate(${item.rotation} ${x} ${y})` : void 0
      },
      layer
    ), text = ctx.renderer.text(
      "",
      x,
      top + fontSize,
      {
        ...style,
        "text-anchor": align === "left" ? "start" : align === "right" ? "end" : "middle",
        "dominant-baseline": "auto",
        class: "facet-chart-text-content"
      },
      group
    );
    lines.forEach((line, index) => {
      let tspan = ctx.renderer.create(
        "tspan",
        { x, y: top + fontSize + index * lineHeight },
        text
      );
      tspan.textContent = line;
    });
  }
}

// src/core/chart.ts
var svgResourceId = 0, SMALL_CHART_DATA_LABEL_THRESHOLD = 180, TITLE_DEFAULT_MARGIN = LAYOUT.titleHeight - 20, SUBTITLE_DEFAULT_MARGIN = LAYOUT.subtitleHeight - 16, TEXT_RESERVE_GAP = 8, MAX_SPACING_SHARE = 0.85, VALUE_DOMAIN_PADDING = 0.05, CHROME_SPACING_REFERENCE_WIDTH = 960, CHROME_SPACING_REFERENCE_HEIGHT = 600, MIN_CHROME_SPACING_SCALE = 0.35, axisLabelOffset = (options) => {
  if (options.labels?.enabled === !1) return 0;
  let value = options.labels?.offset;
  return typeof value == "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}, FacetViz = class _FacetViz {
  constructor(container, options) {
    this.events = new EventEmitter();
    this.series = [];
    this.destroyed = !1;
    this.boostHoverCleanups = [];
    /** Play the enter animation on the next render (first render + data updates). */
    this.animateNext = !0;
    /** Rendered SVG data marks in keyboard-navigation order. */
    this.accessiblePoints = [];
    /** Saved series/title/xAxis levels for drill-down navigation. */
    this.drillStack = [];
    /** Nested transaction state used to coalesce public API mutations. */
    this.batchDepth = 0;
    this.batchDirty = !1;
    this.batchPreserveSeriesState = !0;
    this.batchPreserveAxisRange = !0;
    this.batchNeedsReflow = !1;
    this.batchAnimate = !1;
    this.batchCheckpoints = [];
    let el = typeof container == "string" ? document.querySelector(container) : container;
    if (!el) throw new Error("FacetViz: container element not found");
    this.container = el, enforceConfiguredValidation(options), this.userOptions = merge({}, options), this.options = resolveChartOptions(this.userOptions), this.theme = resolveTheme(this.options.theme), this.colors = this.options.chart?.colors ?? this.options.colors ?? this.theme.colors, this.width = this.options.chart?.width ?? (this.container.clientWidth || 640), this.height = this.options.chart?.height ?? (this.container.clientHeight || 400), this.build(), this.render(), this.options.chart?.events?.load?.(this), this.setupReflow(), typeof requestAnimationFrame < "u" && (this.initialReflowFrame = requestAnimationFrame(() => {
      this.initialReflowFrame = void 0, this.reflow();
    }));
  }
  /**
   * Re-read the container's current width/height and re-render if either
   * changed. Safe to call any time — e.g. after your own layout (a resizable
   * panel, a grid library, a tab becoming visible) settles into its final
   * size, so the chart doesn't need to wait for a resize event to catch up.
   * A dimension pinned via `chart.width`/`chart.height` is left untouched.
   */
  reflow() {
    if (this.destroyed) return;
    let w = this.options.chart?.width ?? this.container.clientWidth, h = this.options.chart?.height ?? this.container.clientHeight;
    (w && Math.abs(w - this.width) > 1 || h && Math.abs(h - this.height) > 1) && (w && (this.width = w), h && (this.height = h), this.animateNext = !1, this.render());
  }
  /** Re-render when the container resizes (unless reflow/that dimension is disabled). */
  setupReflow() {
    this.resizeObserver?.disconnect(), this.resizeObserver = void 0, this.resizeFrame !== void 0 && (cancelAnimationFrame(this.resizeFrame), this.resizeFrame = void 0), !(this.options.chart?.reflow === !1 || typeof ResizeObserver > "u" || this.options.chart?.width && this.options.chart?.height) && (this.resizeObserver = new ResizeObserver(() => {
      this.resizeFrame !== void 0 && cancelAnimationFrame(this.resizeFrame), this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = void 0, this.reflow();
      });
    }), this.resizeObserver.observe(this.container));
  }
  // -- Build model -------------------------------------------------------
  build() {
    this.series = this.options.series.map((opts, i) => {
      let categories = resolveCategories(
        [opts],
        axisAt(this.options.xAxis, opts.xAxis ?? 0)
      ), s = createSeries(opts.type ?? "line", opts, categories);
      return s.index = i, s.color = opts.color ?? opts.highColor ?? paletteColor(this.colors, i), s;
    });
  }
  /** Re-resolve all defaults and rebuild the model after an API update. */
  resolveUpdatedOptions(preserveSeriesState, preserveAxisRange = !1) {
    let state = preserveSeriesState ? captureSeriesState(this.series) : [], xRange = preserveAxisRange ? this.axisRange(this.options.xAxis) : void 0, yRange = preserveAxisRange ? this.axisRange(this.options.yAxis) : void 0, resolved = resolveChartOptions(this.userOptions), target = this.options;
    for (let key of Object.keys(target)) delete target[key];
    Object.assign(this.options, resolved), xRange && this.restoreAxisRange("xAxis", xRange), yRange && this.restoreAxisRange("yAxis", yRange), this.theme = resolveTheme(this.options.theme), this.colors = this.options.chart?.colors ?? this.options.colors ?? this.theme.colors, this.options.chart?.width !== void 0 && (this.width = this.options.chart.width), this.options.chart?.height !== void 0 && (this.height = this.options.chart.height), this.build(), preserveSeriesState && restoreSeriesState(this.series, state);
  }
  axisRange(axis) {
    if (!(!axis || Array.isArray(axis)) && !(axis.min === void 0 && axis.max === void 0))
      return { min: axis.min, max: axis.max };
  }
  restoreAxisRange(axis, range) {
    let current = this.options[axis];
    Array.isArray(current) || (this.options[axis] = { ...current ?? {}, ...range });
  }
  /** Validate and apply immediately, or queue a single rebuild/render in a batch. */
  commitOptions(nextOptions, behavior) {
    if (this.batchDepth > 0) {
      this.userOptions = nextOptions, this.batchDirty = !0, this.batchPreserveSeriesState &&= behavior.preserveSeriesState, this.batchPreserveAxisRange &&= behavior.preserveAxisRange, this.batchNeedsReflow ||= behavior.setupReflow, this.batchAnimate ||= behavior.animate;
      return;
    }
    enforceConfiguredValidation(nextOptions), this.userOptions = nextOptions, this.resolveUpdatedOptions(behavior.preserveSeriesState, behavior.preserveAxisRange), behavior.setupReflow && this.setupReflow(), this.animateNext = behavior.animate, this.render();
  }
  flushBatch() {
    if (!this.batchDirty || this.destroyed) {
      this.resetBatchFlags();
      return;
    }
    enforceConfiguredValidation(this.userOptions), this.resolveUpdatedOptions(
      this.batchPreserveSeriesState,
      this.batchPreserveAxisRange
    ), this.batchNeedsReflow && this.setupReflow(), this.animateNext = this.batchAnimate, this.render(), this.resetBatchFlags();
  }
  resetBatchFlags() {
    this.batchDirty = !1, this.batchPreserveSeriesState = !0, this.batchPreserveAxisRange = !0, this.batchNeedsReflow = !1, this.batchAnimate = !1;
  }
  // -- Rendering ---------------------------------------------------------
  /**
   * True when `chart.responsive` (default on) and this render's pixel size
   * together call for hiding data-style labels. Drives two things from the
   * one computation so they can't drift apart: `applyResponsiveOverrides`
   * clearing a cartesian/pie series' own `dataLabels.enabled`, and the
   * `suppressDataLabels` flag handed to every series via `seriesContext` for
   * value labels (heatmap, sunburst, radialbar) that aren't gated by a
   * `dataLabels` option of their own.
   */
  suppressDataLabels() {
    return this.options.chart?.responsive !== !1 && Math.min(this.width, this.height) < SMALL_CHART_DATA_LABEL_THRESHOLD;
  }
  /**
   * Hide data labels on very small charts and drop axis lines at the smallest
   * sizes, leaving more room for the series geometry. Overrides resolved
   * per-instance state for the duration of this render only and returns a
   * function that restores the originals.
   */
  applyResponsiveOverrides() {
    let originals = /* @__PURE__ */ new Map(), originalDataLabels = /* @__PURE__ */ new Map(), target = this.options, remember = (key) => {
      originals.has(key) || originals.set(key, target[key]);
    };
    for (let rule of this.options.responsive ?? []) {
      let condition = rule.condition ?? {};
      if ((condition.minWidth === void 0 || this.width >= condition.minWidth) && (condition.maxWidth === void 0 || this.width <= condition.maxWidth) && (condition.minHeight === void 0 || this.height >= condition.minHeight) && (condition.maxHeight === void 0 || this.height <= condition.maxHeight))
        for (let [key, value] of Object.entries(rule.options ?? {}))
          value === void 0 || key === "series" || key === "responsive" || (remember(key), target[key] = merge(target[key], value));
    }
    let restore = () => {
      for (let [key, value] of originals) target[key] = value;
      for (let [series, dataLabels] of originalDataLabels)
        series.options.dataLabels = dataLabels;
    };
    if (this.options.chart?.responsive === !1) return restore;
    if (this.suppressDataLabels())
      for (let series of this.series) {
        let dataLabels = series.options.dataLabels;
        dataLabels?.enabled && (originalDataLabels.set(series, dataLabels), series.options.dataLabels = { ...dataLabels, enabled: !1 });
      }
    if (!(Math.min(this.width, this.height) < 110)) return restore;
    let patch = { lineWidth: 0 }, overrideAxis = (a) => Array.isArray(a) ? a.map((ax) => ({ ...ax, ...patch })) : { ...a ?? {}, ...patch };
    return remember("xAxis"), remember("yAxis"), this.options.xAxis = overrideAxis(this.options.xAxis), this.options.yAxis = overrideAxis(this.options.yAxis), restore;
  }
  render() {
    if (this.destroyed) return;
    let restoreResponsive = this.applyResponsiveOverrides();
    try {
      this.boostHoverCleanups.forEach((cleanup) => cleanup()), this.boostHoverCleanups = [], this.accessiblePoints = [], this.renderer ? (this.renderer.clear(), this.renderer.setSize(this.width, this.height)) : (this.renderer = new Renderer(this.width, this.height), this.renderer.mount(this.container)), applyTheme(
        this.theme,
        this.options.chart?.responsive === !1 ? 1 : chartFontScale(this.width, this.height),
        this.options.chart?.scaleFonts !== !1
      ), this.renderer.create(
        "rect",
        {
          x: 0,
          y: 0,
          width: this.width,
          height: this.height,
          fill: this.options.chart?.backgroundColor ?? this.theme.backgroundColor
        },
        this.renderer.root
      ), this.tooltip && this.tooltip.destroy(), this.options.tooltip?.enabled !== !1 && (this.tooltip = new Tooltip(this.container, {
        backgroundColor: this.theme.tooltip.backgroundColor,
        borderColor: this.theme.tooltip.borderColor,
        color: this.theme.tooltip.color,
        ...this.options.tooltip
      }));
      let spacing = this.resolveSpacing(), top = spacing[0];
      top += this.renderTitles(top);
      let legendItems = this.buildLegendItems(), showLegend = this.options.legend?.enabled !== !1 && legendItems.length > 1, legendPlace = this.legendPlacement(), legendVertical = legendPlace === "left" || legendPlace === "right", legendReserveH = 0, legendReserveW = 0;
      if (showLegend) {
        let legendOptions = this.options.legend ?? {}, legendSpacingScale = this.chromeSpacingScale(legendPlace);
        if (legendVertical)
          legendReserveW = Legend.verticalWidth(
            legendItems,
            legendOptions,
            legendPlace,
            legendSpacingScale
          );
        else {
          let legendWidth = this.width - spacing[1] - spacing[3];
          legendReserveH = Legend.horizontalHeight(
            legendItems,
            legendWidth,
            legendOptions,
            legendPlace,
            legendSpacingScale
          );
        }
      }
      let outer = {
        x: spacing[3] + (legendPlace === "left" ? legendReserveW : 0),
        y: top + (legendPlace === "top" ? legendReserveH : 0),
        width: this.width - spacing[1] - spacing[3] - legendReserveW,
        height: this.height - top - spacing[2] - legendReserveH
      }, nestedDims = firstAxis(this.options.xAxis)?.dimensions, t = this.options.trellis, chartType = this.options.chart?.type, vis = () => this.series.filter((s) => s.visible && s.points.length);
      if (chartType === "butterfly")
        this.renderButterflyPanel(outer, vis());
      else if (chartType === "radar")
        this.renderRadarPanel(outer, vis());
      else if (chartType === "marimekko")
        this.renderMarimekkoPanel(outer, vis());
      else if (nestedDims && nestedDims.length >= 1)
        this.renderNestedPanel(
          outer,
          this.series.filter((s) => s.visible && s.points.length),
          nestedDims
        );
      else if (t && (t.columns || t.rows) && t.table !== !1 && t.sharedX !== !1 && t.sharedY !== !1)
        this.renderTrellisTable(outer, t);
      else {
        let panels = this.computePanels(outer), sharedSeries = t && (t.columns || t.rows) ? this.series.filter((s) => s.visible && s.points.length) : void 0;
        for (let panel of panels)
          this.renderPanel(
            panel,
            sharedSeries ? {
              x: t?.sharedX === !1 ? void 0 : sharedSeries,
              y: t?.sharedY === !1 ? void 0 : sharedSeries
            } : void 0
          );
      }
      if (showLegend) {
        let legendOptions = this.options.legend ?? {}, margin = legendMargin(
          legendOptions,
          legendPlace,
          this.chromeSpacingScale(legendPlace)
        ), lx = outer.x, ly = outer.y + outer.height + margin, lw = outer.width, lh = legendReserveH;
        legendPlace === "top" ? ly = top + TOP_LEGEND_INSET : legendPlace === "left" ? (lx = spacing[3], ly = outer.y, lw = legendReserveW, lh = outer.height) : legendPlace === "right" && (lx = outer.x + outer.width + margin, ly = outer.y, lw = legendReserveW, lh = outer.height), lx += Number.isFinite(legendOptions.offsetX) ? legendOptions.offsetX ?? 0 : 0, ly += Number.isFinite(legendOptions.offsetY) ? legendOptions.offsetY ?? 0 : 0, new Legend({
          renderer: this.renderer,
          items: legendItems,
          options: legendOptions,
          x: lx,
          y: ly,
          width: lw,
          height: lh,
          layout: legendVertical ? "vertical" : "horizontal",
          onToggle: (i) => this.toggleSeries(i)
        }).render(this.renderer.group({}, this.renderer.root));
      }
      renderChartTexts({
        renderer: this.renderer,
        width: this.width,
        height: this.height,
        texts: this.options.texts ?? [],
        textScale: this.textScale()
      }), this.applyAccessibility(), this.installZoom(outer), this.drawDrillUp(outer), this.animateNext && this.animateEnter(), this.animateNext = !1, this.events.emit("render", this), this.options.chart?.events?.render?.(this);
    } finally {
      restoreResponsive();
    }
  }
  /** Set chart-level semantics after all point marks have been registered. */
  applyAccessibility() {
    let root = this.renderer.root;
    if (this.options.accessibility?.enabled === !1) {
      root.removeAttribute("role"), root.removeAttribute("aria-label"), root.removeAttribute("aria-roledescription");
      return;
    }
    let label = this.options.accessibility?.description ?? this.options.title?.text ?? `${this.options.chart?.type ?? "chart"} chart with ${this.series.length} series`;
    root.setAttribute("role", "figure"), root.setAttribute("aria-roledescription", "chart"), root.setAttribute("aria-label", label);
    let style = this.renderer.create("style", {}, root);
    style.textContent = `.facet-a11y-point:focus{outline:none}.facet-a11y-point:focus-visible{filter:drop-shadow(0 0 2px ${this.theme.axis.labelColor}) drop-shadow(0 0 2px ${this.theme.axis.labelColor})}`;
  }
  /** Enter animation: bars grow from the baseline, lines draw in, the rest fade. */
  animateEnter() {
    let opt = this.options.chart?.animation;
    if (opt === !1) return;
    let cfg = typeof opt == "object" ? opt : {};
    if (cfg.enabled === !1 || typeof Element.prototype.animate != "function")
      return;
    let duration = cfg.duration ?? 600, easing = cfg.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)", inverted = this.isInverted(this.series);
    this.renderer.root.querySelectorAll(".facet-series").forEach((g, gi) => {
      let delay = Math.min(gi * 60, 240), cls = g.getAttribute("class") ?? "";
      cls.includes("facet-column") || cls.includes("facet-marimekko") ? g.querySelectorAll("rect.facet-point, rect").forEach(
        (r) => {
          r.style.transformBox = "fill-box", r.style.transformOrigin = inverted ? "left center" : "center bottom", r.animate(
            [
              { transform: inverted ? "scaleX(0)" : "scaleY(0)" },
              { transform: "none" }
            ],
            { duration, easing, delay, fill: "backwards" }
          );
        }
      ) : cls.includes("facet-line") || cls.includes("facet-arearange") || cls.includes("facet-radar") ? g.querySelectorAll("path").forEach((p) => {
        if (p.getAttribute("fill") !== "none") {
          p.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration,
            easing,
            delay,
            fill: "backwards"
          });
          return;
        }
        let len = p.getTotalLength?.() ?? 0;
        if (!len) return;
        p.style.strokeDasharray = `${len}`;
        let anim = p.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: duration + 200, easing, delay, fill: "backwards" }
        );
        anim.onfinish = () => {
          p.style.strokeDasharray = "";
        };
      }) : g.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" }
        ],
        { duration, easing, delay, fill: "backwards" }
      );
    });
  }
  /** Convert a client X coordinate to the SVG's internal x (accounts for CSS scaling). */
  localX(clientX) {
    let r = this.renderer.root.getBoundingClientRect();
    return r.width ? (clientX - r.left) * (this.width / r.width) : clientX;
  }
  localY(clientY) {
    let r = this.renderer.root.getBoundingClientRect();
    return r.height ? (clientY - r.top) * (this.height / r.height) : clientY;
  }
  /**
   * Drag-select on a numeric/datetime x-axis to zoom. Sets the x-axis min/max
   * and re-renders; a "Reset zoom" control restores the full range.
   */
  installZoom(outer) {
    let z = this.options.chart?.zoom, type = typeof z == "object" ? z.type : z;
    if (!type) return;
    let st = this.zoomState;
    if (!st) return;
    let xScale = st.xScale, yScale = st.yScale, canX = (type === "x" || type === "xy") && !!xScale?.invert && xScale.bandwidth() === 0, canY = (type === "y" || type === "xy") && !!yScale?.invert && yScale.bandwidth() === 0;
    if (!canX && !canY) return;
    let plot = st.plot, root = this.renderer.root, overlay = this.renderer.create(
      "rect",
      {
        x: plot.x,
        y: plot.y,
        width: plot.width,
        height: plot.height,
        fill: "transparent",
        style: "cursor:crosshair",
        class: "facet-zoom-overlay"
      },
      root
    ), clampX = (v) => Math.max(plot.x, Math.min(plot.x + plot.width, v)), clampY = (v) => Math.max(plot.y, Math.min(plot.y + plot.height, v)), startX = 0, startY = 0, band = null, bandRect = (x, y) => ({
      x: canX ? Math.min(startX, x) : plot.x,
      width: canX ? Math.abs(x - startX) : plot.width,
      y: canY ? Math.min(startY, y) : plot.y,
      height: canY ? Math.abs(y - startY) : plot.height
    });
    overlay.addEventListener("mousedown", (e) => {
      startX = clampX(this.localX(e.clientX)), startY = clampY(this.localY(e.clientY)), band = this.renderer.create(
        "rect",
        {
          ...bandRect(startX, startY),
          fill: "rgba(37,99,235,0.15)",
          stroke: "rgba(37,99,235,0.6)"
        },
        root
      );
      let move = (ev) => {
        let r = bandRect(
          clampX(this.localX(ev.clientX)),
          clampY(this.localY(ev.clientY))
        );
        band.setAttribute("x", String(r.x)), band.setAttribute("width", String(r.width)), band.setAttribute("y", String(r.y)), band.setAttribute("height", String(r.height));
      }, up = (ev) => {
        window.removeEventListener("mousemove", move), window.removeEventListener("mouseup", up);
        let endX = clampX(this.localX(ev.clientX)), endY = clampY(this.localY(ev.clientY));
        band?.remove(), band = null;
        let dragX = canX && Math.abs(endX - startX) >= 6, dragY = canY && Math.abs(endY - startY) >= 6;
        if (!(!dragX && !dragY)) {
          if (dragX) {
            let a = xScale.invert(Math.min(startX, endX)), b = xScale.invert(Math.max(startX, endX));
            this.setAxisRange("xAxis", a, b);
          }
          if (dragY) {
            let a = yScale.invert(Math.max(startY, endY)), b = yScale.invert(Math.min(startY, endY));
            this.setAxisRange("yAxis", a, b);
          }
          this.animateNext = !1, this.render();
        }
      };
      window.addEventListener("mousemove", move), window.addEventListener("mouseup", up);
    });
    let xa = axisAt(this.options.xAxis, 0), ya = axisAt(this.options.yAxis, 0);
    if (xa.min !== void 0 || xa.max !== void 0 || ya.min !== void 0 || ya.max !== void 0) {
      let g = this.renderer.group(
        { class: "facet-zoom-reset", style: "cursor:pointer" },
        root
      ), bx = outer.x + outer.width - 92, by = outer.y + 2;
      this.renderer.create(
        "rect",
        {
          x: bx,
          y: by,
          width: 90,
          height: 22,
          rx: 5,
          fill: this.theme.tooltip.backgroundColor,
          stroke: THEME.axis.lineColor
        },
        g
      ), this.renderer.text(
        "\u27F2 Reset zoom",
        bx + 45,
        by + 15,
        {
          "text-anchor": "middle",
          ...FONTS.axisLabel,
          fill: this.theme.axis.labelColor
        },
        g
      ), g.addEventListener("click", () => {
        this.clearAxisRange("xAxis"), this.clearAxisRange("yAxis"), this.animateNext = !0, this.render();
      });
    }
  }
  /** Set an axis' min/max (single-axis only; leaves multi-axis configs alone). */
  setAxisRange(axis, min, max) {
    let cur = this.options[axis];
    Array.isArray(cur) || (this.options[axis] = { ...cur ?? {}, min, max });
  }
  /** Remove min/max from a single-axis config (used by "Reset zoom"). */
  clearAxisRange(axis) {
    let cur = this.options[axis];
    if (Array.isArray(cur) || !cur) return;
    let { min, max, ...rest } = cur;
    this.options[axis] = rest;
  }
  /**
   * Font-size multiplier for positioned texts, matching the `scaleFonts` /
   * `responsive` opt-outs the chrome scale already honours.
   */
  textScale() {
    let chart = this.options.chart;
    return chart?.responsive === !1 || chart?.scaleFonts === !1 ? 1 : chartTextScale(this.width, this.height);
  }
  /** Configured spacing, with text reserves folded in and capped to the chart. */
  resolveSpacing() {
    return this.clampSpacing(
      this.spacingWithTextReserves(
        this.options.chart?.spacing ?? [5, 5, 5, 5]
      )
    );
  }
  /**
   * Spacing is authored in absolute pixels, so a pair tuned on a large card
   * can exceed a small one outright -- once top + bottom is taller than the
   * chart the plot rect goes negative, and series fall out of it and lay
   * themselves out against the full chart instead, as if no spacing had been
   * set at all. Shrink each opposing pair proportionally so the plot always
   * keeps a usable share of the chart, whatever size it renders at.
   */
  clampSpacing(spacing) {
    let fit = (a, b, extent2) => {
      let total = a + b, limit = extent2 * MAX_SPACING_SHARE;
      if (total <= limit || total <= 0) return [a, b];
      let scale = limit / total;
      return [a * scale, b * scale];
    }, [top, bottom] = fit(spacing[0], spacing[2], this.height), [right, left] = fit(spacing[1], spacing[3], this.width);
    return [top, right, bottom, left];
  }
  /**
  * `spacing` with each edge-anchored positioned text's own side widened to
  * hold it, when `chart.autoSpaceTexts` is on. Every text is measured through
  * the same style and scale renderChartTexts will draw it with, so the
  * reserve stays correct at any chart size rather than depending on a
  * `spacing` value that was only right at the one size it was tuned at.
  *
  * The reserve *adds to* the configured spacing rather than replacing it, so
  * the two mean different things and neither silently cancels the other:
  * fitting the text is this function's job, while `spacing` is the padding
  * the caller wants on top of that. Replacing instead left `spacing` inert
  * on exactly the sides a text sat on -- a control that quietly did nothing.
  */
  spacingWithTextReserves(spacing) {
    let texts = this.options.texts ?? [];
    if (this.options.chart?.autoSpaceTexts !== !0 || !texts.length)
      return spacing;
    let textScale = this.textScale(), reserve = [null, null, null, null];
    for (let item of texts) {
      if (!item.text || item.enabled === !1) continue;
      let style = resolveChartTextStyle(item, textScale), fontSize = parseFloat(style["font-size"] ?? "11") || 11, lines = item.text.split(`
`), align = item.align ?? "left", verticalAlign = item.verticalAlign ?? "top", side, extent2;
      if (verticalAlign === "top" || verticalAlign === "bottom") {
        side = verticalAlign === "top" ? 0 : 2;
        let offsetY = (item.offsetY ?? 0) * textScale, lineHeight = item.lineHeight != null ? item.lineHeight * textScale : fontSize * 1.2;
        extent2 = fontSize + lineHeight * (lines.length - 1) + (verticalAlign === "top" ? offsetY : -offsetY);
      } else if (align === "left" || align === "right") {
        side = align === "left" ? 3 : 1;
        let offsetX = (item.offsetX ?? 0) * textScale;
        extent2 = Math.max(
          ...lines.map(
            (line) => this.renderer.measureText(line, style).width
          )
        ) + (align === "left" ? offsetX : -offsetX);
      } else
        continue;
      reserve[side] = Math.max(
        reserve[side] ?? 0,
        Math.max(0, extent2) + TEXT_RESERVE_GAP
      );
    }
    return spacing.map(
      (configured, side) => (reserve[side] ?? 0) + configured
    );
  }
  renderTitles(top) {
    let used = 0, title = this.options.title;
    if (title?.text && title.enabled !== !1) {
      let x = this.titleX(title.align), style = {
        ...FONTS.title,
        ...sanitizeStyle(title.style)
      }, baseline = (parseFloat(style["font-size"] ?? "18") || 18) + 2;
      this.renderer.text(
        title.text,
        x,
        top + baseline + (title.offsetY ?? 0),
        {
          "text-anchor": this.anchor(title.align),
          ...style
        },
        this.renderer.root
      ), used += baseline + (title.margin ?? TITLE_DEFAULT_MARGIN) + Math.max(0, title.offsetY ?? 0);
    }
    let sub = this.options.subtitle;
    if (sub?.text && sub.enabled !== !1) {
      let x = this.titleX(sub.align), style = {
        ...FONTS.subtitle,
        ...sanitizeStyle(sub.style)
      }, baseline = (parseFloat(style["font-size"] ?? "13") || 13) + 3;
      this.renderer.text(
        sub.text,
        x,
        top + used + baseline + (sub.offsetY ?? 0),
        {
          "text-anchor": this.anchor(sub.align),
          ...style
        },
        this.renderer.root
      ), used += baseline + (sub.margin ?? SUBTITLE_DEFAULT_MARGIN) + Math.max(0, sub.offsetY ?? 0);
    }
    return used;
  }
  titleX(align) {
    let spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
    return align === "left" ? spacing[3] : align === "right" ? this.width - spacing[1] : this.width / 2;
  }
  anchor(align) {
    return align === "left" ? "start" : align === "right" ? "end" : "middle";
  }
  // -- Panels (trellis) --------------------------------------------------
  computePanels(outer) {
    let t = this.options.trellis, colDim = t?.columns, rowDim = t?.rows;
    if (!colDim && !rowDim)
      return [{ rect: outer, series: this.series, title: void 0 }];
    let colVals = colDim ? this.dimensionValues(colDim) : [void 0], rowVals = rowDim ? this.dimensionValues(rowDim) : [void 0], gap = t?.gap ?? 24, pw = (outer.width - gap * (colVals.length - 1)) / colVals.length, ph = (outer.height - gap * (rowVals.length - 1)) / rowVals.length, panels = [];
    return rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        let rect = {
          x: outer.x + ci * (pw + gap),
          y: outer.y + ri * (ph + gap),
          width: pw,
          height: ph
        }, series = this.series.map(
          (s) => s.filterByDimensions({ [colDim ?? ""]: cv, [rowDim ?? ""]: rv })
        ), title = [cv, rv].filter((v) => v !== void 0).join(" \xB7 ");
        panels.push({ rect, series, title });
      });
    }), panels;
  }
  dimensionValues(dim) {
    let seen = /* @__PURE__ */ new Set(), out = [];
    for (let s of this.series)
      for (let p of s.points) {
        let v = p.options[dim];
        v !== void 0 && !seen.has(String(v)) && (seen.add(String(v)), out.push(v));
      }
    return out;
  }
  /** Estimated px width of the widest category-axis label. */
  catLabelWidth(visible, opts = axisAt(this.options.xAxis, 0), axisIndex = 0) {
    let cats = this.currentCategories(visible, axisIndex) ?? [], label = (value) => opts.labels?.formatter ? String(opts.labels.formatter(value)) : opts.labels?.format ? formatString(opts.labels.format, { value }) : value, style = {
      ...FONTS.axisLabel,
      ...sanitizeStyle(opts.labels?.style)
    }, measured = cats.reduce(
      (max, category) => Math.max(
        max,
        this.renderer.measureText(label(String(category)), style).width
      ),
      0
    );
    return opts.labels?.maxWidth ? Math.min(measured, opts.labels.maxWidth) : measured;
  }
  /** Estimated px width of the widest value-axis label. */
  valueLabelWidth(visible, valOpts) {
    let [dmin, dmax] = this.valueDomain(visible), fmt = (v) => {
      if (valOpts.labels?.formatter) return String(valOpts.labels.formatter(v));
      let r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
      return valOpts.labels?.format ? formatString(valOpts.labels.format, { value: r }) : String(r);
    }, style = {
      ...FONTS.axisLabel,
      ...sanitizeStyle(valOpts.labels?.style)
    }, measured = Math.max(
      this.renderer.measureText(fmt(dmin), style).width,
      this.renderer.measureText(fmt(dmax), style).width,
      this.renderer.measureText(fmt((dmin + dmax) / 2), style).width
    );
    return valOpts.labels?.maxWidth ? Math.min(measured, valOpts.labels.maxWidth) : measured;
  }
  /** Space to reserve for an axis on a given side (vertical → width, else height). */
  /**
   * How many px to shave off a fixed axis-reserve constant as the chart's
   * shorter side shrinks below 300px. A flat reserve stays the same size
   * regardless of chart size, so on a small chart (dashboard card,
   * resizable panel) it ends up as a visibly dead gap that doesn't shrink
   * along with everything else. Ramps from 0 at 300px up to `maxReduce` at
   * 100px and below.
   */
  smallChartTaper(maxReduce) {
    if (this.options.chart?.responsive === !1) return 0;
    let shortSide = Math.min(this.width, this.height);
    return Math.max(0, Math.min(1, (300 - shortSide) / 200)) * maxReduce;
  }
  /** Responsive multiplier for default gaps perpendicular to a chart side. */
  chromeSpacingScale(side) {
    if (this.options.chart?.responsive === !1) return 1;
    let ratio = side === "top" || side === "bottom" ? this.height / CHROME_SPACING_REFERENCE_HEIGHT : this.width / CHROME_SPACING_REFERENCE_WIDTH;
    return Math.max(MIN_CHROME_SPACING_SCALE, Math.min(1, ratio));
  }
  axisReserve(opts, side, labelW) {
    if (opts.visible === !1) return 6;
    let title = opts.title?.text && opts.title.enabled !== !1 ? 1 : 0, titleMargin = opts.title?.margin ?? (side === "top" || side === "bottom" ? LAYOUT.axisTitleGap : 8) * this.chromeSpacingScale(side), titleExtra = title ? 10 + titleMargin + Math.max(0, opts.title?.offset ?? 0) : 0, horizontalTitleDelta = title ? titleMargin - 14 + Math.max(0, opts.title?.offset ?? 0) : 0, labelsOn = opts.labels?.enabled !== !1, labelOffset = axisLabelOffset(opts);
    if (side === "left" || side === "right") {
      if (!labelsOn) return LAYOUT.tickLength + 6 + titleExtra;
      let floor = title ? LAYOUT.defaultLeftAxisWidth - Math.max(0, 8 - titleMargin) : LAYOUT.defaultLeftAxisWidth - this.smallChartTaper(14);
      return Math.max(
        floor + labelOffset,
        LAYOUT.tickLength + 8 + labelW + labelOffset + titleExtra
      );
    }
    let rot = opts.labels?.rotation ?? (opts.labels?.autoRotation?.length ? Math.max(...opts.labels.autoRotation.map((value) => Math.abs(value))) : 0), rotExtra = rot ? Math.abs(Math.sin(rot * Math.PI / 180)) * labelW : 0;
    return labelsOn ? (title ? LAYOUT.defaultBottomAxisHeight : LAYOUT.defaultBottomAxisHeight - this.smallChartTaper(10)) + (title ? 8 : 0) + horizontalTitleDelta + rotExtra + labelOffset : title ? LAYOUT.tickLength + titleMargin + 10 + Math.max(0, opts.title?.offset ?? 0) : LAYOUT.tickLength + 6;
  }
  renderPanel(panel, shared) {
    let visible = panel.series.filter((s) => s.visible && s.points.length);
    if (!visible.length) return;
    let cartesian = visible.some((s) => s.capabilities().cartesian), inverted = this.isInverted(visible), plot = panel.rect;
    if (panel.title && (this.renderer.text(
      panel.title,
      plot.x + plot.width / 2,
      plot.y + 12,
      {
        "text-anchor": "middle",
        ...FONTS.subtitle,
        "font-weight": "600"
      },
      this.renderer.root
    ), plot = { ...plot, y: plot.y + 20, height: plot.height - 20 }), cartesian && this.options.chart?.polar) {
      this.renderCartesianPolarPanel(plot, visible);
      return;
    }
    if (!cartesian) {
      this.renderPolarPanel(plot, visible);
      return;
    }
    let catOpts = firstAxis(this.options.xAxis) ?? {}, catOpts2 = axisAt(this.options.xAxis, 1), valOpts = axisAt(this.options.yAxis, 0), catSide = inverted ? catOpts.opposite ? "right" : "left" : catOpts.opposite ? "top" : "bottom", valSide = inverted ? valOpts.opposite ? "top" : "bottom" : valOpts.opposite ? "right" : "left", onSecondary = (s) => (s.options.yAxis ?? 0) === 1, renderSecondary = !inverted && visible.some(onSecondary), valOpts2 = renderSecondary ? axisAt(this.options.yAxis, 1) : void 0, secondaryYSide = valOpts2?.opposite === void 0 ? valSide === "right" ? "left" : "right" : valOpts2.opposite ? "right" : "left", onSecondaryX = (s) => (s.options.xAxis ?? 0) === 1, renderSecondaryX = !inverted && visible.some(onSecondaryX), secondaryXSide = catOpts2.opposite === void 0 ? catSide === "top" ? "bottom" : "top" : catOpts2.opposite ? "top" : "bottom", catReserve = this.axisReserve(
      catOpts,
      catSide,
      this.catLabelWidth(visible)
    ), valReserve = this.axisReserve(
      valOpts,
      valSide,
      this.valueLabelWidth(visible, valOpts)
    ), pad = { left: 8, right: 8, top: 6, bottom: 6 };
    pad[catSide] = catReserve, pad[valSide] = valReserve, renderSecondaryX && (pad[secondaryXSide] = Math.max(
      pad[secondaryXSide],
      this.axisReserve(
        catOpts2,
        secondaryXSide,
        this.catLabelWidth(
          visible.filter(onSecondaryX),
          catOpts2,
          1
        )
      )
    )), renderSecondary && valOpts2 && (pad[secondaryYSide] = Math.max(
      pad[secondaryYSide],
      this.axisReserve(
        valOpts2,
        secondaryYSide,
        this.valueLabelWidth(visible.filter(onSecondary), valOpts2)
      )
    ));
    let axisPlot = {
      x: plot.x + pad.left,
      y: plot.y + pad.top,
      width: plot.width - pad.left - pad.right,
      height: plot.height - pad.top - pad.bottom
    };
    computeStacks(visible);
    let { xScale, xScale2, yScale, yScale2 } = this.buildScales(
      visible,
      axisPlot,
      inverted,
      shared
    ), group = this.groupInfo(visible), catScale = inverted ? yScale : xScale, valScale = inverted ? xScale : yScale, axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    ), isSlope = visible.length > 0 && visible.every((s) => s.type === "slope"), catAxis = new Axis({
      renderer: this.renderer,
      scale: catScale,
      position: catSide,
      spacingScale: this.chromeSpacingScale(catSide),
      plot: axisPlot,
      options: isSlope ? {
        ...catOpts,
        lineWidth: 0,
        ticks: !1,
        gridLineWidth: catOpts.gridLineWidth ?? 1
      } : catOpts,
      // Off by default (matching the usual column/bar look), but honour an
      // explicit `gridLineWidth` — currently the only way to opt in, since
      // a category scale never gets "nice" numeric ticks to derive one from.
      grid: isSlope ? !0 : !!catOpts.gridLineWidth
    });
    catAxis.render(axisLayer);
    let catAxis2;
    renderSecondaryX && xScale2 && (catAxis2 = new Axis({
      renderer: this.renderer,
      scale: xScale2,
      position: secondaryXSide,
      spacingScale: this.chromeSpacingScale(secondaryXSide),
      plot: axisPlot,
      options: {
        ...catOpts2,
        opposite: secondaryXSide === "top"
      },
      grid: !1
    }), catAxis2.render(axisLayer));
    let valAxis = new Axis({
      renderer: this.renderer,
      scale: valScale,
      position: valSide,
      spacingScale: this.chromeSpacingScale(valSide),
      plot: axisPlot,
      options: isSlope ? { ...valOpts, lineWidth: 0 } : valOpts,
      grid: !isSlope
    });
    valAxis.render(axisLayer);
    let valAxis2;
    renderSecondary && valOpts2 && yScale2 && (valAxis2 = new Axis({
      renderer: this.renderer,
      scale: yScale2,
      position: secondaryYSide,
      spacingScale: this.chromeSpacingScale(secondaryYSide),
      plot: axisPlot,
      options: valOpts2,
      grid: !1
    }), valAxis2.render(axisLayer)), this.plotCtx = { plot: axisPlot, xScale, xScale2, yScale, inverted }, this.zoomState = inverted ? void 0 : { plot: axisPlot, xScale, yScale };
    let yScaleFor = (s) => yScale2 && onSecondary(s) ? yScale2 : yScale, xScaleFor = (s) => xScale2 && onSecondaryX(s) ? xScale2 : xScale, cctx = !inverted && this.boostEnabled(visible) ? this.createBoostCanvas(axisPlot) : null, hits = [];
    renderAnnotations({
      renderer: this.renderer,
      plot: axisPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      xScale2,
      yScale,
      yScale2,
      layer: "below"
    });
    let existing = new Set(this.renderer.root.children);
    for (let s of visible) {
      let sx = xScaleFor(s), sy = yScaleFor(s);
      if (cctx && this.isBoostable(s))
        this.drawBoostSeries(s, cctx, sx, sy, hits);
      else {
        let ctx = this.seriesContext(
          s,
          axisPlot,
          sx,
          sy,
          group,
          inverted,
          !1
        );
        s.render(ctx);
      }
    }
    this.clipToPlot(axisPlot, existing), cctx && this.installBoostHover(axisPlot, hits), renderAnnotations({
      renderer: this.renderer,
      plot: axisPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      xScale2,
      yScale,
      yScale2,
      layer: "above"
    });
    let aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root
    );
    catAxis.renderAbove(aboveLayer), catAxis2?.renderAbove(aboveLayer), valAxis.renderAbove(aboveLayer), valAxis2?.renderAbove(aboveLayer);
  }
  /** Clip the series groups added since `existing` was captured to the plot rect. */
  clipToPlot(plot, existing) {
    let NS = "http://www.w3.org/2000/svg", root = this.renderer.root, defs = root.querySelector("defs");
    defs || (defs = document.createElementNS(NS, "defs"), root.insertBefore(defs, root.firstChild));
    let id = `facet-clip-${++svgResourceId}`, cp = document.createElementNS(NS, "clipPath");
    cp.setAttribute("id", id), cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    let rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(plot.x - 2)), rect.setAttribute("y", String(plot.y - 2)), rect.setAttribute("width", String(plot.width + 4)), rect.setAttribute("height", String(plot.height + 4)), cp.appendChild(rect), defs.appendChild(cp);
    for (let el of Array.from(root.children)) {
      if (existing.has(el)) continue;
      let cls = el.getAttribute("class") ?? "";
      (cls.includes("facet-series") || cls.includes("facet-boost")) && el.setAttribute("clip-path", `url(#${id})`);
    }
  }
  static {
    // -- Boost (high-volume canvas rendering) ------------------------------
    this.BOOSTABLE = /* @__PURE__ */ new Set([
      "scatter",
      "jitter",
      "bubble",
      "line",
      "spline",
      "step",
      "area",
      "areaspline"
    ]);
  }
  isBoostable(s) {
    return !s.options.stacking && _FacetViz.BOOSTABLE.has(s.type);
  }
  boostEnabled(visible) {
    let b = this.options.chart?.boost;
    if (b === !1) return !1;
    if (typeof b == "object" ? b.enabled : b) return !0;
    let threshold = typeof b == "object" && b.threshold || 1500;
    return visible.some(
      (s) => this.isBoostable(s) && s.points.length > threshold
    );
  }
  /** A canvas overlay sized to the plot, drawing in the SVG coordinate system. */
  createBoostCanvas(plot) {
    let fo = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "foreignObject"
    );
    fo.setAttribute("x", String(plot.x)), fo.setAttribute("y", String(plot.y)), fo.setAttribute("width", String(plot.width)), fo.setAttribute("height", String(plot.height)), fo.setAttribute("class", "facet-boost");
    let canvas = document.createElement("canvas"), dpr = typeof window < "u" && window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(plot.width * dpr)), canvas.height = Math.max(1, Math.round(plot.height * dpr)), canvas.style.width = `${plot.width}px`, canvas.style.height = `${plot.height}px`, fo.appendChild(canvas), this.renderer.root.appendChild(fo);
    let c = null;
    try {
      c = canvas.getContext("2d");
    } catch {
      c = null;
    }
    return c ? (c.scale(dpr, dpr), c.translate(-plot.x, -plot.y), c) : (fo.remove(), null);
  }
  drawBoostSeries(s, c, xScale, yScale, hits) {
    let color = s.color;
    if (["line", "spline", "step", "area", "areaspline"].includes(s.type)) {
      let raw = [], drawSegment = () => {
        if (!raw.length) return;
        let pts = decimateLine(raw);
        if (c.beginPath(), pts.forEach(
          (p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)
        ), s.type.startsWith("area")) {
          let zeroY = yScale.scale(0);
          c.lineTo(pts[pts.length - 1].x, zeroY), c.lineTo(pts[0].x, zeroY), c.closePath(), c.fillStyle = alpha(color, s.options.fillOpacity ?? 0.35), c.fill();
        }
        c.strokeStyle = color, c.lineWidth = s.options.lineWidth ?? s.options.size ?? 2, c.lineJoin = "round", c.stroke();
        for (let p of raw)
          if (hits.push({ x: p.x, y: p.y, point: p.point, series: s }), s.options.marker?.enabled === !0) {
            let marker = s.options.marker;
            this.drawCanvasMarker(c, p.x, p.y, {
              marker,
              radius: p.point.options.radius ?? marker.radius ?? 4,
              fill: p.point.color ?? marker.fillColor ?? color,
              stroke: marker.lineColor ?? "#ffffff",
              strokeWidth: marker.lineWidth ?? 1
            });
          }
        raw = [];
      };
      for (let point of s.points) {
        if (point.y === void 0) {
          drawSegment();
          continue;
        }
        raw.push({
          x: xScale.scale(point.x),
          y: yScale.scale(point.y),
          point
        });
      }
      drawSegment();
    } else {
      let zs = s.type === "bubble" ? s.points.map((p) => p.options.z ?? 1) : [], [zMin, zMax] = extent(zs), [rMin, rMax] = s.options.sizeRange ?? [6, 34], rng = seededRandom(s.index * 7919 + s.points.length + 1), jitterBand = xScale instanceof CategoryScale ? xScale.bandwidth() : 0, jitterSpread = (s.options.jitter ?? 0.5) * jitterBand, marker = s.options.marker ?? {};
      for (let p of s.points) {
        if (p.y === void 0) continue;
        let px = xScale.scale(p.x), py = yScale.scale(p.y);
        s.type === "jitter" && jitterBand > 0 && (px += (rng() - 0.5) * jitterSpread);
        let r = p.options.radius ?? s.options.radius ?? s.options.size ?? marker.radius ?? 5;
        if (s.type === "bubble") {
          let t = zMax === zMin ? 1 : ((p.options.z ?? 1) - zMin) / (zMax - zMin);
          r = Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
        }
        if (marker.enabled !== !1) {
          let base = p.color ?? color;
          this.drawCanvasMarker(c, px, py, {
            marker,
            radius: r,
            fill: marker.fillColor ?? (s.type === "bubble" ? alpha(base, 0.55) : base),
            stroke: marker.lineColor ?? (s.type === "bubble" ? base : "#ffffff"),
            strokeWidth: marker.lineWidth ?? 1
          });
        }
        hits.push({ x: px, y: py, point: p, series: s });
      }
    }
  }
  /** Canvas equivalent of the shared SVG marker renderer used in boost mode. */
  drawCanvasMarker(c, x, y, spec) {
    let { marker, radius: r } = spec;
    switch (c.beginPath(), marker.symbol ?? "circle") {
      case "square":
        c.rect(x - r, y - r, r * 2, r * 2);
        break;
      case "diamond":
        c.moveTo(x, y - r), c.lineTo(x + r, y), c.lineTo(x, y + r), c.lineTo(x - r, y), c.closePath();
        break;
      case "triangle":
        c.moveTo(x, y - r), c.lineTo(x + r, y + r), c.lineTo(x - r, y + r), c.closePath();
        break;
      case "rectangle": {
        let width = marker.width ?? r * 2, height = marker.height ?? r * 2;
        c.rect(x - width / 2, y - height / 2, width, height);
        break;
      }
      default:
        c.arc(x, y, r, 0, Math.PI * 2);
    }
    c.fillStyle = spec.fill, c.fill(), spec.strokeWidth > 0 && (c.strokeStyle = spec.stroke, c.lineWidth = spec.strokeWidth, c.stroke());
  }
  /** Nearest-point hover for boosted series (no per-point DOM nodes). */
  installBoostHover(plot, hits) {
    if (!this.tooltip || !hits.length) return;
    let marker, active = null, root = this.renderer.root, onMove = (e) => {
      let mx = this.localX(e.clientX), my = this.localY(e.clientY);
      if (mx < plot.x || mx > plot.x + plot.width || my < plot.y || my > plot.y + plot.height) {
        marker?.remove(), marker = void 0, active && (this.handlePointEvent("mouseOut", active.series, active.point, e), this.tooltip.hide()), active = null;
        return;
      }
      let best = null, bd = 400;
      for (let h of hits) {
        let dx = h.x - mx, dy = h.y - my, d = dx * dx + dy * dy;
        d < bd && (bd = d, best = h);
      }
      if (marker?.remove(), marker = void 0, !best) {
        active && this.handlePointEvent("mouseOut", active.series, active.point, e), active = null, this.tooltip.hide();
        return;
      }
      active !== best && (active && this.handlePointEvent("mouseOut", active.series, active.point, e), this.handlePointEvent("mouseOver", best.series, best.point, e), active = best), marker = this.renderer.create(
        "circle",
        {
          cx: best.x,
          cy: best.y,
          r: 5,
          fill: "none",
          stroke: best.series.color,
          "stroke-width": 2,
          "pointer-events": "none"
        },
        root
      );
      let p = best.point, s = best.series;
      this.tooltip.show(
        {
          series: s.name,
          x: p.name ?? p.x,
          y: p.y,
          name: p.name ?? p.x,
          point: p.options,
          color: p.color ?? s.color
        },
        s.options.tooltip
      ), this.tooltip.move(e.clientX, e.clientY);
    }, onLeave = (e) => {
      marker?.remove(), marker = void 0, active && this.handlePointEvent("mouseOut", active.series, active.point, e), active = null, this.tooltip.hide();
    }, onClick = (e) => {
      active && this.handlePointEvent("click", active.series, active.point, e);
    };
    root.addEventListener("mousemove", onMove), root.addEventListener("mouseleave", onLeave), root.addEventListener("click", onClick), this.boostHoverCleanups.push(() => {
      marker?.remove(), root.removeEventListener("mousemove", onMove), root.removeEventListener("mouseleave", onLeave), root.removeEventListener("click", onClick);
    });
  }
  /**
   * Cross-tab trellis table. All cells share one y-scale and one x-scale;
   * the y-axis is labelled only on the leftmost column and the x-axis only on
   * the bottom row. Dimension values become column headers (top) and row
   * headers (right), with the dimension name shown once.
   */
  renderTrellisTable(outer, t) {
    let colDim = t.columns, rowDim = t.rows, colVals = colDim ? this.dimensionValues(colDim) : [void 0], rowVals = rowDim ? this.dimensionValues(rowDim) : [void 0], gap = t.gap ?? 0, allVisible = this.series.filter((s) => s.visible && s.points.length), categories = this.currentCategories(allVisible), xOpts = firstAxis(this.options.xAxis) ?? {}, yOpts0 = axisAt(this.options.yAxis, 0), inverted = this.isInverted(allVisible), onSecondary = (s) => (s.options.yAxis ?? 0) === 1, secondaryVisible = allVisible.filter(onSecondary), hasSecondary = !inverted && secondaryVisible.length > 0, primaryVisible = hasSecondary ? allVisible.filter((s) => !onSecondary(s)) : allVisible, yOpts1 = hasSecondary ? axisAt(this.options.yAxis, 1) : void 0, cellSeriesFor = (cv, rv) => {
      let filter = {};
      return colDim && (filter[colDim] = cv), rowDim && (filter[rowDim] = rv), this.series.map((s) => s.filterByDimensions(filter)).filter((s) => s.visible && s.points.length);
    };
    for (let rv of rowVals)
      for (let cv of colVals)
        computeStacks(cellSeriesFor(cv, rv));
    let primaryDomainSeries = primaryVisible.length ? primaryVisible : allVisible, [vMin, vMax] = this.valueDomain(primaryDomainSeries), preservePrimaryZeroMin = this.hasNonNegativeColumnsOrBars(
      primaryDomainSeries,
      vMin
    );
    (primaryVisible.length ? primaryVisible : allVisible).some(
      (s) => ["column", "bar", "area", "areaspline", "lollipop"].includes(s.type)
    ) && (vMin = Math.min(vMin, 0), vMax = Math.max(vMax, 0));
    let vMin2 = 0, vMax2 = 1, secondaryPreservesZeroMin = !1;
    if (hasSecondary && yOpts1) {
      [vMin2, vMax2] = this.valueDomain(secondaryVisible);
      let preserveSecondaryZeroMin = this.hasNonNegativeColumnsOrBars(
        secondaryVisible,
        vMin2
      );
      secondaryVisible.some(
        (s) => ["column", "bar", "area", "areaspline", "lollipop"].includes(s.type)
      ) && (vMin2 = Math.min(vMin2, 0), vMax2 = Math.max(vMax2, 0)), secondaryPreservesZeroMin = preserveSecondaryZeroMin;
    }
    let dimNameRowH = 16, rowValueColW = rowDim ? Math.max(
      32,
      Math.max(
        rowDim.length,
        ...rowVals.filter((v) => v !== void 0).map((v) => String(v).length),
        0
      ) * 6.6 + 4
    ) : 0, leftTitle = inverted ? xOpts.title : yOpts0.title, titleReserveLeft = leftTitle?.text && leftTitle.enabled !== !1 ? 18 + Math.max(0, (leftTitle.margin ?? 8) - 8) + Math.max(0, leftTitle.offset ?? 0) : 0, tickLabelW = LAYOUT.tickLength + 8 + axisLabelOffset(inverted ? xOpts : yOpts0) + (inverted ? this.catLabelWidth(allVisible) : this.valueLabelWidth(
      primaryVisible.length ? primaryVisible : allVisible,
      yOpts0
    )), colHeaderH = colDim ? dimNameRowH + 20 : rowDim ? dimNameRowH : 0, rowHeaderW = rowDim ? rowValueColW : 0, leftReserve = rowHeaderW + tickLabelW + titleReserveLeft, titleReserveRight = hasSecondary && yOpts1?.title?.text && yOpts1.title.enabled !== !1 ? 18 + Math.max(0, (yOpts1.title.margin ?? 8) - 8) + Math.max(0, yOpts1.title.offset ?? 0) : 0, rightReserve = hasSecondary && yOpts1 ? LAYOUT.tickLength + 8 + axisLabelOffset(yOpts1) + this.valueLabelWidth(secondaryVisible, yOpts1) + titleReserveRight : 0, bottomReserve = LAYOUT.defaultBottomAxisHeight + axisLabelOffset(inverted ? yOpts0 : xOpts), gridX = outer.x + leftReserve, gridY = outer.y + colHeaderH, gridW = outer.width - leftReserve - rightReserve, gridH = outer.height - colHeaderH - bottomReserve, cellW = (gridW - gap * (colVals.length - 1)) / colVals.length, cellH = (gridH - gap * (rowVals.length - 1)) / rowVals.length, lineColor = THEME.axis.lineColor, headerLayer = this.renderer.group(
      { class: "facet-trellis-headers" },
      this.renderer.root
    ), dividerBottom = gridY + gridH + LAYOUT.tickLength + 12;
    if (colDim && (this.renderer.text(
      colDim,
      gridX + gridW / 2,
      outer.y + dimNameRowH / 2 + 4,
      {
        "text-anchor": "middle",
        ...FONTS.axisTitle
      },
      headerLayer
    ), colVals.forEach((cv, ci) => {
      if (cv === void 0) return;
      let cx = gridX + ci * (cellW + gap) + cellW / 2;
      if (this.renderer.text(
        String(cv),
        cx,
        outer.y + dimNameRowH + 17,
        {
          "text-anchor": "middle",
          ...FONTS.axisLabel,
          "font-weight": "600",
          fill: THEME.axis.titleColor
        },
        headerLayer
      ), ci > 0) {
        let dx = gridX + ci * (cellW + gap) - gap / 2;
        this.renderer.create(
          "line",
          {
            x1: dx,
            y1: outer.y + dimNameRowH,
            x2: dx,
            y2: dividerBottom,
            stroke: lineColor,
            "stroke-width": 1
          },
          headerLayer
        );
      }
    })), rowDim) {
      let rowDimNameY = colDim ? outer.y + dimNameRowH + 17 : outer.y + colHeaderH / 2 + 4;
      this.renderer.text(
        rowDim,
        outer.x + rowHeaderW / 2,
        rowDimNameY,
        {
          "text-anchor": "middle",
          ...FONTS.axisTitle
        },
        headerLayer
      ), rowVals.forEach((rv, ri) => {
        if (rv === void 0) return;
        let cy = gridY + ri * (cellH + gap) + cellH / 2 + 4;
        if (this.renderer.text(
          String(rv),
          outer.x + rowHeaderW / 2,
          cy,
          {
            "text-anchor": "middle",
            ...FONTS.axisLabel,
            "font-weight": "600",
            fill: THEME.axis.titleColor
          },
          headerLayer
        ), ri > 0) {
          let dy = gridY + ri * (cellH + gap) - gap / 2;
          this.renderer.create(
            "line",
            {
              x1: outer.x,
              y1: dy,
              x2: outer.x + outer.width,
              y2: dy,
              stroke: lineColor,
              "stroke-width": 1
            },
            headerLayer
          );
        }
      }), this.renderer.create(
        "line",
        {
          x1: gridX,
          //outer.x + rowHeaderW,
          y1: outer.y,
          x2: gridX,
          // outer.x + rowHeaderW,
          y2: dividerBottom,
          // gridY,
          stroke: lineColor,
          "stroke-width": 1
        },
        headerLayer
      ), this.renderer.create(
        "line",
        {
          x1: gridX + gridW,
          y1: outer.y,
          x2: gridX + gridW,
          y2: dividerBottom,
          stroke: lineColor,
          "stroke-width": 1
        },
        headerLayer
      );
    }
    colHeaderH && this.renderer.create(
      "line",
      {
        x1: outer.x,
        y1: gridY,
        x2: outer.x + outer.width,
        y2: gridY,
        stroke: lineColor,
        "stroke-width": 1
      },
      headerLayer
    ), this.renderer.create(
      "line",
      {
        x1: outer.x,
        y1: outer.y + outer.height - bottomReserve,
        x2: outer.x + outer.width,
        y2: outer.y + outer.height - bottomReserve,
        stroke: lineColor,
        "stroke-width": 1
      },
      headerLayer
    ), rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        let cell = {
          x: gridX + ci * (cellW + gap),
          y: gridY + ri * (cellH + gap),
          width: cellW,
          height: cellH
        }, cellSeries = cellSeriesFor(cv, rv), catRange = inverted ? [cell.y, cell.y + cell.height] : [cell.x, cell.x + cell.width], catScale = categories ? new CategoryScale({ categories, range: catRange }) : new LinearScale({
          domain: this.xNumericDomain(
            cellSeries.length ? cellSeries : allVisible
          ),
          range: catRange
        }), dropLastTick = (sc, range) => {
          if (sc instanceof LinearScale) {
            let allTicks = sc.ticks();
            if (allTicks.length > 1)
              return new LinearScale({
                domain: sc.domain,
                range,
                ticks: allTicks.slice(0, -1)
              });
          }
          return sc;
        }, valRange = inverted ? [cell.x, cell.x + cell.width] : [cell.y + cell.height, cell.y], valScale = dropLastTick(
          this.valueScale(
            yOpts0,
            [vMin, vMax],
            valRange,
            !0,
            preservePrimaryZeroMin
          ),
          valRange
        ), valScale2 = hasSecondary && yOpts1 ? dropLastTick(
          this.valueScale(
            yOpts1,
            [vMin2, vMax2],
            [cell.y + cell.height, cell.y],
            !0,
            secondaryPreservesZeroMin
          ),
          [cell.y + cell.height, cell.y]
        ) : void 0, xScale = inverted ? valScale : catScale, yScale = inverted ? catScale : valScale, yScale2 = valScale2, axisLayer = this.renderer.group(
          { class: "facet-axes" },
          this.renderer.root
        ), isLeft = ci === 0, isRight = ci === colVals.length - 1, isBottom = ri === rowVals.length - 1, catLabelled = inverted ? isLeft : isBottom, valLabelled = inverted ? isBottom : isLeft, catAxis = new Axis({
          renderer: this.renderer,
          scale: catScale,
          position: inverted ? "left" : "bottom",
          spacingScale: this.chromeSpacingScale(
            inverted ? "left" : "bottom"
          ),
          plot: cell,
          grid: !!xOpts.gridLineWidth,
          options: catLabelled ? { ...xOpts, title: void 0, ticks: !1 } : { labels: { enabled: !1 }, lineWidth: 0, ticks: !1 }
        });
        catAxis.render(axisLayer);
        let valAxis = new Axis({
          renderer: this.renderer,
          scale: valScale,
          position: inverted ? "bottom" : "left",
          spacingScale: this.chromeSpacingScale(
            inverted ? "bottom" : "left"
          ),
          plot: cell,
          grid: !0,
          options: valLabelled ? inverted ? { ...yOpts0, title: void 0 } : yOpts0 : { labels: { enabled: !1 }, lineWidth: 0 }
        });
        valAxis.render(axisLayer);
        let rightAxis;
        if (hasSecondary && yScale2 && yOpts1 && (rightAxis = new Axis({
          renderer: this.renderer,
          scale: yScale2,
          position: "right",
          spacingScale: this.chromeSpacingScale("right"),
          plot: cell,
          grid: !1,
          options: isRight ? yOpts1 : { labels: { enabled: !1 }, lineWidth: 0 }
        }), rightAxis.render(axisLayer)), cellSeries.length) {
          computeStacks(cellSeries);
          let group = this.groupInfo(cellSeries);
          for (let s of cellSeries) {
            let sy = yScale2 && onSecondary(s) ? yScale2 : yScale, ctx = this.seriesContext(
              s,
              cell,
              xScale,
              sy,
              group,
              inverted,
              !1
            );
            s.render(ctx);
          }
        }
        let aboveLayer = this.renderer.group(
          { class: "facet-axes-above" },
          this.renderer.root
        );
        catAxis.renderAbove(aboveLayer), valAxis.renderAbove(aboveLayer), rightAxis?.renderAbove(aboveLayer);
      });
    });
  }
  renderPolarPanel(plot, visible) {
    let dummy = new LinearScale({ domain: [0, 1], range: [0, 1] }), inverted = this.isInverted(visible);
    computeStacks(visible);
    let stackedRadialBars = visible.filter(
      (item) => item.type === "radialbar" && !!item.options.stacking
    ), radialCategories = [], seenRadialCategories = /* @__PURE__ */ new Set();
    for (let item of stackedRadialBars)
      for (let point of item.points) {
        let key = `${typeof point.x}:${String(point.x)}`;
        seenRadialCategories.has(key) || (seenRadialCategories.add(key), radialCategories.push(point.x));
      }
    let radialValueMax = Math.max(
      1,
      ...stackedRadialBars.flatMap(
        (item) => item.points.map((point) => point.stackHigh ?? point.y ?? 0)
      )
    ), radialSeriesIndex = new Map(
      stackedRadialBars.map((item, index) => [item.index, index])
    );
    for (let s of visible) {
      let ctx = this.seriesContext(
        s,
        plot,
        dummy,
        dummy,
        { count: 1, index: /* @__PURE__ */ new Map() },
        inverted,
        !0
      );
      s.type === "radialbar" && s.options.stacking && (ctx.radialCategories = radialCategories, ctx.radialValueMax = radialValueMax, ctx.radialSeriesIndex = radialSeriesIndex.get(s.index) ?? 0), s.render(ctx);
    }
  }
  /**
   * Project ordinary category/value series into a shared polar coordinate
   * system. Supported renderers opt into polar geometry through their normal
   * SeriesRenderContext, so tooltip, events, labels, stacking, and legends keep
   * the same behavior as their Cartesian equivalents.
   */
  renderCartesianPolarPanel(plot, visible) {
    let supported = /* @__PURE__ */ new Set([
      "line",
      "spline",
      "step",
      "area",
      "areaspline",
      "scatter",
      "jitter",
      "column",
      "dumbbell"
    ]), series = visible.filter((item) => supported.has(item.type));
    if (!series.length) return;
    let inverted = this.options.chart?.inverted === !0;
    computeStacks(series);
    let xOptions = axisAt(this.options.xAxis, 0), yOptions = axisAt(this.options.yAxis, 0), labelStyle = {
      ...FONTS.axisLabel,
      ...sanitizeStyle(xOptions.labels?.style)
    }, framePadding = xOptions.labels?.enabled === !1 ? 12 : Math.max(
      24,
      ...series.flatMap(
        (item) => item.points.map(
          (point) => this.renderer.measureText(String(point.x), labelStyle).width / 2 + 8
        )
      )
    ), circularTitlePadding = inverted && yOptions.title?.text && yOptions.title.enabled !== !1 ? 16 : 0, radius = Math.max(
      1,
      Math.min(plot.width, plot.height) / 2 - Math.min(framePadding + circularTitlePadding, 70)
    ), innerRadius = this.resolvePolarInnerRadius(radius), polarPlot = {
      x: plot.x + plot.width / 2 - radius,
      y: plot.y + plot.height / 2 - radius,
      width: radius * 2,
      height: radius * 2
    }, center = {
      x: polarPlot.x + polarPlot.width / 2,
      y: polarPlot.y + polarPlot.height / 2
    }, categories = this.currentCategories(series), categoryOffset = categories?.length ? Math.PI / categories.length : 0, xScale = categories ? new CategoryScale({
      categories,
      range: inverted ? [innerRadius, radius] : [
        -Math.PI / 2 - categoryOffset,
        Math.PI * 1.5 - categoryOffset
      ],
      padding: 0.12,
      reversed: xOptions.reversed
    }) : this.valueScale(
      xOptions,
      this.xNumericDomain(series),
      inverted ? [innerRadius, radius] : [-Math.PI / 2, Math.PI * 1.5],
      !1
    ), onSecondary = (item) => (item.options.yAxis ?? 0) === 1, primary = series.filter((item) => !onSecondary(item)), secondary = series.filter(onSecondary), polarValueScale = (items, options) => {
      let domainSeries = items.length ? items : series, domain = this.valueDomain(domainSeries), preserveZeroMin = this.hasNonNegativeColumnsOrBars(
        domainSeries,
        domain[0]
      );
      return domainSeries.some(
        (item) => ["column", "area", "areaspline"].includes(item.type)
      ) && options.type !== "log" && (domain = [Math.min(0, domain[0]), Math.max(0, domain[1])]), this.valueScale(
        options,
        domain,
        inverted ? [-Math.PI / 2, Math.PI * 1.5] : [innerRadius, radius],
        !0,
        preserveZeroMin
      );
    }, yScale = polarValueScale(primary, yOptions), yScale2 = secondary.length ? polarValueScale(secondary, axisAt(this.options.yAxis, 1)) : void 0, project = (angle, radial) => ({
      x: center.x + Math.cos(angle) * radial,
      y: center.y + Math.sin(angle) * radial
    }), xTicks = xScale.ticks(), yTicks = yScale.ticks(), annotationProject = inverted ? (radial, angle) => project(angle, radial) : project, holeColor = this.options.chart?.polarInnerBackgroundColor ?? this.options.chart?.backgroundColor ?? this.theme.backgroundColor, drawInvertedRadialLabels = (parent) => {
      if (!(!inverted || xOptions.visible === !1 || xOptions.labels?.enabled === !1))
        for (let tick of xTicks) {
          let radial = xScale.scale(tick);
          if (radial < 0 || radial > radius + 0.5) continue;
          let label = project(-Math.PI / 2, radial);
          this.renderer.text(
            xScale.tickLabel(tick),
            label.x + (xOptions.labels?.offset ?? 6),
            label.y + 4,
            {
              ...labelStyle,
              fill: THEME.axis.labelColor,
              stroke: holeColor,
              "stroke-width": 3,
              "stroke-linejoin": "round",
              "paint-order": "stroke",
              "text-anchor": "start",
              class: "facet-polar-category-label facet-polar-radial-x-label"
            },
            parent
          );
        }
    }, drawCategoryLabels = (parent) => {
      if (xOptions.visible === !1 || xOptions.labels?.enabled === !1)
        return;
      if (xOptions.labels?.position === "inner" && innerRadius > 0 && !!categories?.length) {
        let definitions = this.renderer.create("defs", {}, parent), textRadius = Math.max(
          10,
          innerRadius - (xOptions.labels?.offset ?? 7)
        ), arcSpan = Math.min(
          Math.PI * 0.9,
          Math.PI * 2 / categories.length * 0.78
        );
        for (let tick of xTicks) {
          let angle = xScale.scale(tick), flipped = Math.sin(angle) > 0.05, start = flipped ? angle + arcSpan / 2 : angle - arcSpan / 2, end = flipped ? angle - arcSpan / 2 : angle + arcSpan / 2, from = project(start, textRadius), to = project(end, textRadius), pathId = `facet-polar-label-path-${++svgResourceId}`;
          this.renderer.create(
            "path",
            {
              id: pathId,
              d: `M ${from.x} ${from.y} A ${textRadius} ${textRadius} 0 0 ${flipped ? 0 : 1} ${to.x} ${to.y}`,
              fill: "none",
              stroke: "none"
            },
            definitions
          );
          let text = this.renderer.create(
            "text",
            {
              ...labelStyle,
              fill: THEME.axis.labelColor,
              class: "facet-polar-category-label facet-polar-curved-label"
            },
            parent
          ), textPath = this.renderer.create(
            "textPath",
            {
              href: `#${pathId}`,
              startOffset: "50%",
              "text-anchor": "middle"
            },
            text
          );
          textPath.textContent = xScale.tickLabel(tick);
        }
        return;
      }
      let labelRadius = radius + (xOptions.labels?.offset ?? 10);
      for (let tick of xTicks) {
        let angle = xScale.scale(tick), label = project(angle, labelRadius), cosine = Math.cos(angle);
        this.renderer.text(
          xScale.tickLabel(tick),
          label.x,
          label.y,
          {
            ...labelStyle,
            fill: THEME.axis.labelColor,
            "text-anchor": cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle",
            "dominant-baseline": "middle",
            class: "facet-polar-category-label"
          },
          parent
        );
      }
    }, axes = this.renderer.group(
      { class: "facet-polar-axes" },
      this.renderer.root
    );
    innerRadius > 0 && this.renderer.create(
      "circle",
      {
        cx: center.x,
        cy: center.y,
        r: innerRadius,
        fill: holeColor,
        stroke: "none",
        class: "facet-polar-hole"
      },
      axes
    );
    let gridColor = yOptions.gridLineColor ?? THEME.axis.gridLineColor, drawMinorRings = (scale, options, className) => {
      if (!(options.minorTickInterval === void 0 || (options.minorGridLineWidth ?? 1) <= 0))
        for (let radial of minorGridPositions(scale, options.minorTickInterval))
          radial < 0 || radial > radius + 0.5 || this.renderer.create(
            "circle",
            {
              cx: center.x,
              cy: center.y,
              r: radial,
              fill: "none",
              stroke: options.minorGridLineColor ?? options.gridLineColor ?? THEME.axis.gridLineColor,
              "stroke-width": options.minorGridLineWidth ?? 1,
              "stroke-dasharray": options.minorGridLineDashStyle ?? "2 2",
              class: `facet-minor-gridline ${className}`
            },
            axes
          );
    }, drawMinorSpokes = (scale, options, className) => {
      if (!(options.minorTickInterval === void 0 || (options.minorGridLineWidth ?? 1) <= 0))
        for (let angle of minorGridPositions(scale, options.minorTickInterval)) {
          let innerEdge = project(angle, innerRadius), edge = project(angle, radius);
          this.renderer.create(
            "line",
            {
              x1: innerEdge.x,
              y1: innerEdge.y,
              x2: edge.x,
              y2: edge.y,
              stroke: options.minorGridLineColor ?? options.gridLineColor ?? THEME.axis.gridLineColor,
              "stroke-width": options.minorGridLineWidth ?? 1,
              "stroke-dasharray": options.minorGridLineDashStyle ?? "2 2",
              class: `facet-minor-gridline ${className}`
            },
            axes
          );
        }
    };
    if (inverted) {
      if (xOptions.visible !== !1) {
        let axisStart = project(-Math.PI / 2, innerRadius), axisEnd = project(-Math.PI / 2, radius);
        this.renderer.create(
          "line",
          {
            x1: axisStart.x,
            y1: axisStart.y,
            x2: axisEnd.x,
            y2: axisEnd.y,
            stroke: xOptions.lineColor ?? THEME.axis.lineColor,
            "stroke-width": xOptions.lineWidth ?? 1,
            class: "facet-polar-radial-x-axis"
          },
          axes
        ), drawMinorRings(xScale, xOptions, "facet-polar-minor-x-ring");
        for (let tick of xTicks) {
          let radial = xScale.scale(tick);
          radial < 0 || radial > radius + 0.5 || this.renderer.create(
            "circle",
            {
              cx: center.x,
              cy: center.y,
              r: radial,
              fill: "none",
              stroke: xOptions.gridLineColor ?? THEME.axis.gridLineColor,
              "stroke-width": xOptions.gridLineWidth ?? 1,
              "stroke-dasharray": xOptions.gridLineDashStyle,
              class: "facet-gridline facet-polar-ring facet-polar-x-ring"
            },
            axes
          );
        }
      }
      if (yOptions.visible !== !1) {
        this.renderer.create(
          "circle",
          {
            cx: center.x,
            cy: center.y,
            r: radius,
            fill: "none",
            stroke: yOptions.lineColor ?? THEME.axis.lineColor,
            "stroke-width": yOptions.lineWidth ?? 1,
            class: "facet-polar-y-axis-circle"
          },
          axes
        ), drawMinorSpokes(
          yScale,
          yOptions,
          "facet-polar-minor-angular-y-spoke"
        );
        let seenAngles = /* @__PURE__ */ new Set();
        for (let tick of yTicks) {
          let angle = yScale.scale(tick), normalized = Math.round(
            ((angle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) * 1e6
          ) / 1e6;
          if (seenAngles.has(normalized)) continue;
          seenAngles.add(normalized);
          let innerEdge = project(angle, innerRadius), edge = project(angle, radius);
          if (this.renderer.create(
            "line",
            {
              x1: innerEdge.x,
              y1: innerEdge.y,
              x2: edge.x,
              y2: edge.y,
              stroke: gridColor,
              "stroke-width": yOptions.gridLineWidth ?? 1,
              "stroke-dasharray": yOptions.gridLineDashStyle,
              class: "facet-gridline facet-polar-spoke facet-polar-angular-y-spoke"
            },
            axes
          ), yOptions.labels?.enabled !== !1) {
            let label = project(
              angle,
              radius + (yOptions.labels?.offset ?? 10)
            ), cosine = Math.cos(angle);
            this.renderer.text(
              yScale.tickLabel(tick),
              label.x,
              label.y,
              {
                ...FONTS.axisLabel,
                ...sanitizeStyle(yOptions.labels?.style),
                fill: THEME.axis.labelColor,
                "text-anchor": cosine < -0.15 ? "end" : cosine > 0.15 ? "start" : "middle",
                "dominant-baseline": "middle",
                class: "facet-polar-value-label facet-polar-angular-y-label"
              },
              axes
            );
          }
        }
      }
    } else {
      if (yOptions.visible !== !1) {
        drawMinorRings(yScale, yOptions, "facet-polar-minor-ring");
        for (let tick of yTicks) {
          let radial = yScale.scale(tick);
          radial < 0 || radial > radius + 0.5 || (this.renderer.create(
            "circle",
            {
              cx: center.x,
              cy: center.y,
              r: radial,
              fill: "none",
              stroke: gridColor,
              "stroke-width": yOptions.gridLineWidth ?? 1,
              "stroke-dasharray": yOptions.gridLineDashStyle,
              class: "facet-gridline facet-polar-ring"
            },
            axes
          ), yOptions.labels?.enabled !== !1 && this.renderer.text(
            yScale.tickLabel(tick),
            center.x + 4,
            center.y - radial - 3,
            {
              ...FONTS.axisLabel,
              ...sanitizeStyle(yOptions.labels?.style),
              fill: THEME.axis.labelColor,
              class: "facet-polar-value-label"
            },
            axes
          ));
        }
      }
      if (xOptions.visible !== !1) {
        let sectorMode = this.options.chart?.polarGridLineMode === "sector" && !!categories?.length, gridAngles = sectorMode ? categories.map(
          (_, index) => -Math.PI / 2 - categoryOffset + index * Math.PI * 2 / categories.length
        ) : xTicks.map((tick) => xScale.scale(tick));
        categories?.length || drawMinorSpokes(xScale, xOptions, "facet-polar-minor-spoke");
        for (let angle of gridAngles) {
          let innerEdge = project(angle, innerRadius), edge = project(angle, radius);
          this.renderer.create(
            "line",
            {
              x1: innerEdge.x,
              y1: innerEdge.y,
              x2: edge.x,
              y2: edge.y,
              stroke: xOptions.gridLineColor ?? THEME.axis.gridLineColor,
              "stroke-width": xOptions.gridLineWidth ?? 1,
              "stroke-dasharray": xOptions.gridLineDashStyle,
              class: sectorMode ? "facet-gridline facet-polar-sector-line" : "facet-gridline facet-polar-spoke"
            },
            axes
          );
        }
        drawCategoryLabels(axes);
      }
    }
    if (xOptions.title?.text && xOptions.title.enabled !== !1) {
      let centered = !inverted && xOptions.title.position === "center", align = xOptions.title.align ?? "center", along = align === "start" ? 0.2 : align === "end" ? 0.8 : 0.5, titleX = inverted ? plot.x + (xOptions.title.margin ?? 8) + (xOptions.title.offset ?? 0) + 6 : center.x, titleY = inverted ? plot.y + plot.height * along : centered ? center.y : plot.y + plot.height - (xOptions.title.offset ?? 0);
      this.renderer.text(
        xOptions.title.text,
        titleX,
        titleY,
        {
          ...FONTS.axisTitle,
          ...sanitizeStyle(xOptions.title.style),
          "text-anchor": inverted && align !== "center" ? align === "start" ? "start" : "end" : "middle",
          "dominant-baseline": centered ? "middle" : void 0,
          transform: inverted ? `rotate(-90 ${titleX} ${titleY})` : void 0,
          class: "facet-polar-axis-title facet-polar-x-title"
        },
        axes
      );
    }
    if (yOptions.title?.text && yOptions.title.enabled !== !1) {
      let align = yOptions.title.align ?? "center", along = align === "start" ? 0.2 : align === "end" ? 0.8 : 0.5, x = inverted ? plot.x + plot.width * along : plot.x + (yOptions.title.margin ?? 8) + (yOptions.title.offset ?? 0) + 6, y = inverted ? center.y + radius + 12 - (yOptions.title.offset ?? 0) : plot.y + plot.height * along;
      this.renderer.text(
        yOptions.title.text,
        x,
        y,
        {
          ...FONTS.axisTitle,
          ...sanitizeStyle(yOptions.title.style),
          "text-anchor": align === "start" ? "start" : align === "end" ? "end" : "middle",
          transform: inverted ? void 0 : `rotate(-90 ${x} ${y})`,
          class: "facet-polar-axis-title facet-polar-y-title"
        },
        axes
      );
    }
    renderAnnotations({
      renderer: this.renderer,
      plot: polarPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      yScale,
      yScale2,
      layer: "below",
      project: annotationProject
    });
    let group = this.groupInfo(series);
    for (let item of series)
      item.render(
        this.seriesContext(
          item,
          polarPlot,
          xScale,
          yScale2 && onSecondary(item) ? yScale2 : yScale,
          group,
          inverted,
          !0
        )
      );
    if (inverted) {
      let labelOverlay = this.renderer.group(
        { class: "facet-polar-axis-label-overlay" },
        this.renderer.root
      );
      drawInvertedRadialLabels(labelOverlay);
    }
    renderAnnotations({
      renderer: this.renderer,
      plot: polarPlot,
      annotations: this.options.annotations ?? [],
      xScale,
      yScale,
      yScale2,
      layer: "above",
      project: annotationProject
    });
  }
  resolvePolarInnerRadius(outerRadius) {
    let value = this.options.chart?.polarInnerSize;
    if (value === void 0) return 0;
    let pixels = typeof value == "string" ? outerRadius * (parseFloat(value) / 100) : value;
    return Math.max(0, Math.min(outerRadius * 0.95, pixels));
  }
  // -- Nested (hierarchical x-axis) ------------------------------
  renderNestedPanel(outer, visible, dims) {
    if (!visible.length) return;
    let agg = firstAxis(this.options.xAxis)?.aggregate ?? "sum", { leaves, keys, seriesPoints } = this.buildNested(visible, dims, agg);
    if (!keys.length) return;
    let aggSeries = visible.map(
      (s) => s.withPoints(seriesPoints.get(s.index) ?? [])
    ), inverted = this.isInverted(visible), yOpts0 = axisAt(this.options.yAxis, 0), yOpts1 = axisAt(this.options.yAxis, 1), onAxis = (s, i) => (s.options.yAxis ?? 0) === i, secondary = aggSeries.filter((s) => onAxis(s, 1)), hasSecondary = !inverted && secondary.length > 0, xOpts = firstAxis(this.options.xAxis) ?? {}, split = !!xOpts.opposite, catVisible = xOpts.visible !== !1, rowH = 18, splitSeparatorExtra = split ? Math.max(0, dims.length - 2) * NESTED_SPLIT_TIER_GAP : 0, rotExtra = inverted ? 0 : nestedInnerRotationExtent(leaves, xOpts.labels?.rotation ?? 0), catLabelOffset = catVisible ? axisLabelOffset(xOpts) : 0, bottomSpacingScale = this.chromeSpacingScale("bottom"), leftSpacingScale = this.chromeSpacingScale("left"), rightSpacingScale = this.chromeSpacingScale("right"), plot, catScale, valScale0, valScale1, axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    ), valAxis0, valAxis1;
    if (inverted) {
      let colWidths = nestedLevelWidths(leaves), innerW = colWidths[colWidths.length - 1] ?? 0, outerW = colWidths.slice(0, -1).reduce((a, b) => a + b, 0), totalW = colWidths.reduce((a, b) => a + b, 0), leftReserve = catVisible ? LAYOUT.tickLength + 8 + catLabelOffset + (split ? innerW : totalW) + (xOpts.title?.text && xOpts.title.enabled !== !1 ? 22 + ((xOpts.title.margin ?? 16 * leftSpacingScale) - 14) + Math.max(0, xOpts.title.offset ?? 0) : 0) : 6, rightReserve = catVisible && split ? LAYOUT.tickLength + 8 + catLabelOffset + outerW : 8, bottomReserve = LAYOUT.defaultBottomAxisHeight + axisLabelOffset(yOpts0) + (yOpts0.title?.text && yOpts0.title.enabled !== !1 ? 32 + ((yOpts0.title.margin ?? LAYOUT.axisTitleGap * bottomSpacingScale) - 14) + Math.max(0, yOpts0.title.offset ?? 0) : 0), topReserve = 6;
      plot = {
        x: outer.x + leftReserve,
        y: outer.y + topReserve,
        width: outer.width - leftReserve - rightReserve,
        height: outer.height - topReserve - bottomReserve
      }, catScale = new CategoryScale({
        categories: keys,
        range: [plot.y, plot.y + plot.height]
      });
      let [lo, hi] = this.valueDomain(aggSeries), preserveZeroMin = this.hasNonNegativeColumnsOrBars(aggSeries, lo);
      lo = Math.min(lo, 0), hi = Math.max(hi, 0), valScale0 = this.valueScale(
        yOpts0,
        [lo, hi],
        [plot.x, plot.x + plot.width],
        !0,
        preserveZeroMin
      ), valScale1 = valScale0, valAxis0 = new Axis({
        renderer: this.renderer,
        scale: valScale0,
        position: "bottom",
        spacingScale: this.chromeSpacingScale("bottom"),
        plot,
        options: yOpts0,
        grid: !0
      }), valAxis0.render(axisLayer), catVisible && new NestedAxis({
        renderer: this.renderer,
        scale: catScale,
        plot,
        leaves,
        keys,
        position: split ? "split" : "bottom",
        vertical: !0,
        spacingScale: this.chromeSpacingScale("left"),
        labels: xOpts.labels,
        title: xOpts.title,
        lineColor: xOpts.lineColor,
        lineWidth: xOpts.lineWidth,
        gridLineColor: xOpts.gridLineColor,
        gridLineWidth: xOpts.gridLineWidth,
        alternateGridColor: xOpts.alternateGridColor
      }).render(axisLayer);
    } else {
      let leftReserve = LAYOUT.tickLength + 8 + axisLabelOffset(yOpts0) + this.valueLabelWidth(
        aggSeries.filter((s) => onAxis(s, 0)),
        yOpts0
      ) + (yOpts0.title?.text && yOpts0.title.enabled !== !1 ? 18 + ((yOpts0.title.margin ?? 8 * leftSpacingScale) - 8) + Math.max(0, yOpts0.title.offset ?? 0) : 0), rightReserve = hasSecondary ? LAYOUT.tickLength + 8 + axisLabelOffset(yOpts1) + this.valueLabelWidth(secondary, yOpts1) + (yOpts1.title?.text && yOpts1.title.enabled !== !1 ? 18 + ((yOpts1.title.margin ?? 8 * rightSpacingScale) - 8) + Math.max(0, yOpts1.title.offset ?? 0) : 0) : 8, bottomReserve = catVisible ? LAYOUT.tickLength + catLabelOffset + (split ? 1 : dims.length) * rowH + 12 + rotExtra + splitSeparatorExtra + (xOpts.title?.text && xOpts.title.enabled !== !1 ? 30 + ((xOpts.title.margin ?? LAYOUT.axisTitleGap * bottomSpacingScale) - LAYOUT.axisTitleGap) + Math.max(0, xOpts.title.offset ?? 0) : 0) : 6, topReserve = catVisible && split ? LAYOUT.tickLength + catLabelOffset + (dims.length - 1) * NESTED_SPLIT_TIER_PITCH + 8 : 6;
      plot = {
        x: outer.x + leftReserve,
        y: outer.y + topReserve,
        width: outer.width - leftReserve - rightReserve,
        height: outer.height - topReserve - bottomReserve
      }, catScale = new CategoryScale({
        categories: keys,
        range: [plot.x, plot.x + plot.width]
      });
      let range = [plot.y + plot.height, plot.y], scaleFor = (list, opts) => {
        let domainSeries = list.length ? list : aggSeries, [lo, hi] = this.valueDomain(domainSeries), preserveZeroMin = this.hasNonNegativeColumnsOrBars(
          domainSeries,
          lo
        );
        return lo = Math.min(lo, 0), hi = Math.max(hi, 0), this.valueScale(
          opts,
          [lo, hi],
          range,
          !0,
          preserveZeroMin
        );
      };
      valScale0 = scaleFor(
        aggSeries.filter((s) => onAxis(s, 0)),
        yOpts0
      ), valScale1 = hasSecondary ? scaleFor(secondary, yOpts1) : valScale0, valAxis0 = new Axis({
        renderer: this.renderer,
        scale: valScale0,
        position: "left",
        spacingScale: this.chromeSpacingScale("left"),
        plot,
        options: yOpts0,
        grid: !0
      }), valAxis0.render(axisLayer), hasSecondary && (valAxis1 = new Axis({
        renderer: this.renderer,
        scale: valScale1,
        position: "right",
        spacingScale: this.chromeSpacingScale("right"),
        plot,
        options: yOpts1,
        grid: !1
      }), valAxis1.render(axisLayer)), catVisible && new NestedAxis({
        renderer: this.renderer,
        scale: catScale,
        plot,
        leaves,
        keys,
        position: split ? "split" : "bottom",
        spacingScale: this.chromeSpacingScale("bottom"),
        labels: xOpts.labels,
        title: xOpts.title,
        lineColor: xOpts.lineColor,
        lineWidth: xOpts.lineWidth,
        gridLineColor: xOpts.gridLineColor,
        gridLineWidth: xOpts.gridLineWidth,
        alternateGridColor: xOpts.alternateGridColor
      }).render(axisLayer);
    }
    let group = this.groupInfo(aggSeries), lineFamily = /* @__PURE__ */ new Set([
      "line",
      "spline",
      "step",
      "area",
      "areaspline"
    ]), existing = new Set(this.renderer.root.children);
    for (let s of aggSeries) {
      let valScale = onAxis(s, 1) ? valScale1 : valScale0, xScale = inverted ? valScale : catScale, yScale = inverted ? catScale : valScale, ctx = this.seriesContext(
        s,
        plot,
        xScale,
        yScale,
        group,
        inverted,
        !1
      );
      if (lineFamily.has(s.type)) {
        let segStart = 0;
        for (let i = 1; i <= s.points.length; i++)
          (i === s.points.length || leaves[s.points[i].index][0] !== leaves[s.points[segStart].index][0]) && (s.withPoints(s.points.slice(segStart, i)).render(ctx), segStart = i);
      } else
        s.render(ctx);
    }
    this.clipToPlot(plot, existing);
    let aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root
    );
    valAxis0.renderAbove(aboveLayer), valAxis1?.renderAbove(aboveLayer);
  }
  // -- Butterfly (tornado) ----------------------------------------------
  /**
   * Two series drawn back-to-back around a central category axis: the first
   * grows leftward, the second rightward, sharing one value scale so the halves
   * are directly comparable (population pyramids, before/after tornadoes).
   */
  renderButterflyPanel(outer, visible) {
    let pair = visible.slice(0, 2);
    if (pair.length < 2) {
      let panels = this.computePanels(outer);
      for (let p of panels) this.renderPanel(p);
      return;
    }
    let [leftS, rightS] = pair, categories = this.currentCategories(pair) ?? [], yOpts = firstAxis(this.options.yAxis) ?? {}, maxVal = 0;
    for (let s of pair)
      for (let p of s.points) maxVal = Math.max(maxVal, p.y ?? 0);
    maxVal = yOpts.max ?? (maxVal || 1);
    let bottomReserve = LAYOUT.defaultBottomAxisHeight + axisLabelOffset(yOpts), gutter = 84, plot = {
      x: outer.x,
      y: outer.y + 6,
      width: outer.width,
      height: outer.height - bottomReserve - 6
    }, halfW = (plot.width - gutter) / 2, leftZeroX = plot.x + halfW, rightZeroX = plot.x + halfW + gutter, centerX = (leftZeroX + rightZeroX) / 2, catScale = new CategoryScale({
      categories,
      range: [plot.y, plot.y + plot.height]
    }), leftVal = new LinearScale({
      domain: [0, maxVal],
      range: [leftZeroX, plot.x]
    }), rightVal = new LinearScale({
      domain: [0, maxVal],
      range: [rightZeroX, plot.x + plot.width]
    }), axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    ), leftAxis = new Axis({
      renderer: this.renderer,
      scale: leftVal,
      position: "bottom",
      spacingScale: this.chromeSpacingScale("bottom"),
      grid: !1,
      plot: { x: plot.x, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: void 0 }
    });
    leftAxis.render(axisLayer);
    let rightAxis = new Axis({
      renderer: this.renderer,
      scale: rightVal,
      position: "bottom",
      spacingScale: this.chromeSpacingScale("bottom"),
      grid: !1,
      plot: { x: rightZeroX, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: void 0 }
    });
    rightAxis.render(axisLayer);
    let band = catScale.bandwidth();
    for (let cat of categories) {
      let cy = catScale.scale(cat) + 4;
      this.renderer.text(
        cat,
        centerX,
        cy,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        axisLayer
      );
    }
    this.renderer.text(
      leftS.name,
      plot.x + halfW / 2,
      outer.y + outer.height - 4,
      { "text-anchor": "middle", ...FONTS.axisTitle },
      axisLayer
    ), this.renderer.text(
      rightS.name,
      rightZeroX + halfW / 2,
      outer.y + outer.height - 4,
      { "text-anchor": "middle", ...FONTS.axisTitle },
      axisLayer
    ), this.drawButterflySide(leftS, catScale, leftVal, leftZeroX, band, "left"), this.drawButterflySide(
      rightS,
      catScale,
      rightVal,
      rightZeroX,
      band,
      "right"
    );
    let aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root
    );
    leftAxis.renderAbove(aboveLayer), rightAxis.renderAbove(aboveLayer);
  }
  drawButterflySide(s, catScale, valScale, zeroX, band, side) {
    let g = this.renderer.group(
      { class: `facet-series facet-butterfly ${s.name}` },
      this.renderer.root
    ), barH = band * 0.8;
    for (let p of s.points) {
      if (p.y === void 0) continue;
      let vx = valScale.scale(p.y), rect = {
        x: Math.min(zeroX, vx),
        y: catScale.scale(p.x) - barH / 2,
        width: Math.max(1, Math.abs(vx - zeroX)),
        height: barH
      }, el = this.renderer.create(
        "rect",
        { ...rect, fill: p.color ?? s.color, class: "facet-point" },
        g
      );
      this.bindPointInteraction(el, s, p), el.addEventListener(
        "click",
        (e) => this.handlePointEvent("click", s, p, e)
      ), el.addEventListener(
        "mouseover",
        (e) => this.handlePointEvent("mouseOver", s, p, e)
      ), el.addEventListener(
        "mouseout",
        (e) => this.handlePointEvent("mouseOut", s, p, e)
      );
      let dl = s.options.dataLabels;
      if (dl?.enabled) {
        let text = labelString(dl, {
          x: p.x,
          y: p.y,
          point: p.options,
          series: s.name
        }), outside = (dl.position ?? "outside") !== "inside", lx = side === "left" ? outside ? rect.x - 4 : rect.x + 4 : outside ? rect.x + rect.width + 4 : rect.x + rect.width - 4;
        drawDataLabel(
          this.renderer,
          g,
          text,
          {
            x: lx,
            y: rect.y + barH / 2 + 4,
            anchor: side === "left" ? outside ? "end" : "start" : outside ? "start" : "end"
          },
          dl
        );
      }
    }
  }
  // -- Radar (spider) ----------------------------------------------------
  renderRadarPanel(outer, visible) {
    if (!visible.length) return;
    let cats = this.currentCategories(visible) ?? [], n = cats.length;
    if (n < 3) return;
    let cx = outer.x + outer.width / 2, cy = outer.y + outer.height / 2 + 4, R = Math.min(outer.width, outer.height) / 2 - 34, [, vMaxRaw] = this.valueDomain(visible), vMax = Math.max(vMaxRaw, 0) || 1, angle = (i) => -Math.PI / 2 + i / n * Math.PI * 2, pt = (i, v) => ({
      x: cx + v / vMax * R * Math.cos(angle(i)),
      y: cy + v / vMax * R * Math.sin(angle(i))
    }), grid = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    );
    for (let r = 1; r <= 4; r++) {
      let ring = cats.map((_, i) => {
        let p = pt(i, vMax * r / 4);
        return `${p.x},${p.y}`;
      }).join(" ");
      this.renderer.create(
        "polygon",
        {
          points: ring,
          fill: "none",
          stroke: THEME.axis.gridLineColor,
          "stroke-width": 1
        },
        grid
      );
    }
    cats.forEach((cat, i) => {
      let edge = pt(i, vMax);
      this.renderer.create(
        "line",
        {
          x1: cx,
          y1: cy,
          x2: edge.x,
          y2: edge.y,
          stroke: THEME.axis.gridLineColor
        },
        grid
      );
      let lp = pt(i, vMax * 1.12);
      this.renderer.text(
        String(cat),
        lp.x,
        lp.y,
        {
          "text-anchor": Math.abs(lp.x - cx) < 4 ? "middle" : lp.x > cx ? "start" : "end",
          "dominant-baseline": "middle",
          ...FONTS.axisLabel
        },
        grid
      );
    });
    for (let s of visible) {
      let g = this.renderer.group(
        { class: `facet-series facet-radar ${s.name}` },
        this.renderer.root
      ), pts = cats.map((cat, i) => {
        let p = s.points.find((pp) => String(pp.x) === String(cat)) ?? s.points[i];
        return pt(i, p?.y ?? 0);
      }), poly = pts.map((p) => `${p.x},${p.y}`).join(" "), fillOp = s.options.fillOpacity ?? (s.type === "area" ? 0.3 : 0.12);
      this.renderer.create(
        "polygon",
        {
          points: poly,
          fill: alpha(s.color, fillOp),
          stroke: s.color,
          "stroke-width": s.options.lineWidth ?? s.options.size ?? 2
        },
        g
      );
      let marker = s.options.marker ?? {}, labelData = [];
      pts.forEach((p, i) => {
        let point = s.points.find((pp) => String(pp.x) === String(cats[i])) ?? s.points[i];
        if (!point) return;
        let radius = point.options.radius ?? marker.radius ?? 3.5, el = marker.enabled === !1 ? this.renderer.create(
          "circle",
          {
            cx: p.x,
            cy: p.y,
            r: Math.max(8, radius),
            fill: "transparent",
            "pointer-events": "all",
            class: "facet-point-hit"
          },
          g
        ) : drawMarker(this.renderer, g, p.x, p.y, {
          symbol: marker.symbol ?? "circle",
          radius,
          fill: point.color ?? marker.fillColor ?? s.color,
          stroke: marker.lineColor ?? "#fff",
          strokeWidth: marker.lineWidth ?? 1,
          width: marker.width,
          height: marker.height
        });
        this.bindPointInteraction(el, s, point), el.addEventListener(
          "click",
          (e) => this.handlePointEvent("click", s, point, e)
        ), el.addEventListener(
          "mouseover",
          (e) => this.handlePointEvent("mouseOver", s, point, e)
        ), el.addEventListener(
          "mouseout",
          (e) => this.handlePointEvent("mouseOut", s, point, e)
        ), labelData.push({ pt: p, p: point });
      });
      let dl = s.options.dataLabels;
      if (dl?.enabled) {
        let total = s.points.reduce((sum2, point) => sum2 + (point.y ?? 0), 0);
        for (let { pt: labelPoint, p: point } of labelData) {
          let text = labelString(dl, {
            x: point.x,
            y: point.y,
            point: point.options,
            series: s.name,
            name: point.name ?? point.x,
            index: point.index,
            color: point.color ?? s.color,
            total,
            percentage: total ? (point.y ?? 0) / total * 100 : void 0
          });
          drawDataLabel(
            this.renderer,
            g,
            text,
            { x: labelPoint.x, y: labelPoint.y - 8 - (dl.distance ?? 0), anchor: "middle" },
            dl
          );
        }
      }
    }
  }
  // -- Marimekko (mosaic) ------------------------------------------------
  renderMarimekkoPanel(outer, visible) {
    if (!visible.length) return;
    let cats = this.currentCategories(visible) ?? [];
    if (!cats.length) return;
    let bottomReserve = 22, plot = {
      x: outer.x + 8,
      y: outer.y + 6,
      width: outer.width - 16,
      height: outer.height - bottomReserve - 6
    }, colTotal = cats.map(
      (c) => visible.reduce(
        (s, ser) => s + (ser.points.find((p) => String(p.x) === String(c))?.y ?? 0),
        0
      )
    ), grand = colTotal.reduce((a, b) => a + b, 0) || 1, gap = 2, x = plot.x;
    cats.forEach((cat, ci) => {
      let w = colTotal[ci] / grand * (plot.width - gap * (cats.length - 1)), y = plot.y;
      visible.forEach((s, si) => {
        let p = s.points.find((pp) => String(pp.x) === String(cat)), val = p?.y ?? 0, h = colTotal[ci] > 0 ? val / colTotal[ci] * plot.height : 0, el = this.renderer.create(
          "rect",
          {
            x,
            y,
            width: Math.max(1, w),
            height: Math.max(0, h),
            fill: p?.color ?? s.color ?? paletteColor(this.colors, si),
            stroke: "#fff",
            "stroke-width": 1,
            class: "facet-point"
          },
          this.renderer.group(
            { class: `facet-series facet-marimekko ${s.name}` },
            this.renderer.root
          )
        );
        p && (this.bindPointInteraction(el, s, p), el.addEventListener(
          "click",
          (e) => this.handlePointEvent("click", s, p, e)
        ), el.addEventListener(
          "mouseover",
          (e) => this.handlePointEvent("mouseOver", s, p, e)
        ), el.addEventListener(
          "mouseout",
          (e) => this.handlePointEvent("mouseOut", s, p, e)
        ));
        let dl = s.options.dataLabels;
        if (h > 16 && w > 26 && val > 0 && dl?.enabled !== !1) {
          let percentage = val / colTotal[ci] * 100;
          dl?.enabled ? drawDataLabel(
            this.renderer,
            this.renderer.root,
            labelString(dl, {
              x: cat,
              y: val,
              point: p?.options ?? {},
              series: s.name,
              name: p?.name ?? cat,
              index: p?.index,
              color: p?.color ?? s.color,
              total: colTotal[ci],
              percentage
            }),
            { x: x + w / 2, y: y + h / 2 + 4, anchor: "middle" },
            { ...dl, color: dl.color ?? "#fff", fontWeight: dl.fontWeight ?? "600" }
          ) : this.renderer.text(
            `${Math.round(percentage)}%`,
            x + w / 2,
            y + h / 2,
            {
              "text-anchor": "middle",
              "dominant-baseline": "middle",
              ...FONTS.dataLabel,
              fill: "#fff",
              "font-weight": "600"
            },
            this.renderer.root
          );
        }
        y += h;
      }), this.renderer.text(
        String(cat),
        x + w / 2,
        plot.y + plot.height + 14,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        this.renderer.root
      ), x += w + gap;
    });
  }
  /**
   * Collapse each series' points into one aggregated value per unique
   * combination of `dims`. Leaves are ordered so that outer dimensions form
   * contiguous groups, and both the outer groups and each group's inner
   * values are ordered by first appearance in the data (not sorted
   * alphabetically) — see the ordering note below.
   */
  buildNested(visible, dims, agg) {
    let orderByPrefix = dims.map(
      () => /* @__PURE__ */ new Map()
    ), tuples = /* @__PURE__ */ new Map();
    for (let s of visible)
      for (let p of s.points) {
        let tuple = dims.map((d) => String(p.options[d] ?? "")), prefix = "";
        tuple.forEach((v, lvl) => {
          let scoped = orderByPrefix[lvl].get(prefix);
          scoped || (scoped = /* @__PURE__ */ new Map(), orderByPrefix[lvl].set(prefix, scoped)), scoped.has(v) || scoped.set(v, scoped.size), prefix = prefix + "\0" + v;
        }), tuples.set(tuple.join("\0"), tuple);
      }
    let leaves = [...tuples.values()].sort((a, b) => {
      let prefix = "";
      for (let lvl = 0; lvl < dims.length; lvl++) {
        let scoped = orderByPrefix[lvl].get(prefix), d = scoped.get(a[lvl]) - scoped.get(b[lvl]);
        if (d !== 0) return d;
        prefix = prefix + "\0" + a[lvl];
      }
      return 0;
    }), keys = leaves.map((l) => l.join("\0")), keyIndex = new Map(keys.map((k, i) => [k, i])), seriesPoints = /* @__PURE__ */ new Map();
    for (let s of visible) {
      let buckets = /* @__PURE__ */ new Map();
      for (let p of s.points) {
        let key = dims.map((d) => String(p.options[d] ?? "")).join("\0");
        (buckets.get(key) ?? buckets.set(key, []).get(key)).push(p.y ?? 0);
      }
      let pts = [];
      for (let [key, vals] of buckets) {
        let i = keyIndex.get(key);
        pts.push({
          x: key,
          index: i,
          y: this.aggregate(vals, agg),
          name: leaves[i].join(" / "),
          options: { y: this.aggregate(vals, agg) }
        });
      }
      pts.sort((a, b) => a.index - b.index), seriesPoints.set(s.index, pts);
    }
    return { leaves, keys, seriesPoints };
  }
  aggregate(vals, mode) {
    if (!vals.length) return 0;
    switch (mode) {
      case "avg":
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      case "count":
        return vals.length;
      case "min":
        return Math.min(...vals);
      case "max":
        return Math.max(...vals);
      default:
        return vals.reduce((a, b) => a + b, 0);
    }
  }
  isInverted(visible) {
    return this.options.chart?.inverted ? !0 : visible.some((s) => s.type === "bar");
  }
  // -- Scales ------------------------------------------------------------
  buildScales(visible, plot, inverted, shared) {
    let xSource = shared?.x ?? visible, ySource = shared?.y ?? visible, primaryXSource = xSource.filter((s) => (s.options.xAxis ?? 0) === 0), secondaryXSource = xSource.filter((s) => (s.options.xAxis ?? 0) === 1), categories = this.currentCategories(
      primaryXSource.length ? primaryXSource : xSource,
      0
    ), xAxisOpts = axisAt(this.options.xAxis, 0), xAxisOpts2 = axisAt(this.options.xAxis, 1), yAxisOpts = axisAt(this.options.yAxis, 0), onSecondary = (s) => (s.options.yAxis ?? 0) === 1, hasSecondary = !inverted && ySource.some(onSecondary), primaryVisible = hasSecondary ? ySource.filter((s) => !onSecondary(s)) : ySource, primaryDomainSeries = primaryVisible.length ? primaryVisible : ySource, [vMin, vMax] = this.valueDomain(primaryDomainSeries), preservePrimaryZeroMin = this.hasNonNegativeColumnsOrBars(
      primaryDomainSeries,
      vMin
    ), includeZero = primaryVisible.some(
      (s) => ["column", "bar", "area", "areaspline", "errorbar", "lollipop"].includes(
        s.type
      )
    ), primaryValueAxis = yAxisOpts;
    (includeZero || primaryValueAxis.startOnZero === !0) && primaryValueAxis.type !== "log" && (vMin = Math.min(vMin, 0), vMax = Math.max(vMax, 0));
    let GEOM_PAD = {
      boxplot: 8,
      candlestick: 8,
      columnrange: 10
    }, bubble = primaryVisible.find((s) => s.type === "bubble"), bubbleR = bubble ? (bubble.options.sizeRange?.[1] ?? 34) + 2 : 0, markerR = Math.max(
      bubbleR,
      ...primaryVisible.filter(
        (s) => s.type === "scatter" || s.type === "jitter" || s.type === "dumbbell" || s.type === "slope"
      ).map((s) => (s.options.marker?.radius ?? 5) + 2),
      ...primaryVisible.map((s) => GEOM_PAD[s.type] ?? 0),
      0
    );
    if (markerR) {
      let valueAxisOpts = yAxisOpts, valuePx = inverted ? plot.width : plot.height, padY = markerR / Math.max(1, valuePx) * (vMax - vMin || 1);
      valueAxisOpts.min === void 0 && (vMin -= padY), valueAxisOpts.max === void 0 && (vMax += padY);
    }
    if (primaryVisible.some((s) => {
      let dl = s.options.dataLabels;
      return dl?.enabled ? dl.position === void 0 || dl.position === "outside" || dl.position === "top" : !1;
    })) {
      let valueAxisOpts = yAxisOpts, valuePx = inverted ? plot.width : plot.height, padY = 18 / Math.max(1, valuePx) * (vMax - vMin || 1);
      valueAxisOpts.max === void 0 && (vMax += padY);
    }
    let numericScale = (list, opts, range, reversed) => {
      let [dmin, dmax] = this.xNumericDomain(list), min = opts.min ?? dmin, max = opts.max ?? dmax;
      if (markerR) {
        let padX = markerR / Math.max(1, plot.width) * (max - min || 1);
        opts.min === void 0 && (min -= padX), opts.max === void 0 && (max += padX);
      }
      if (opts.startOnZero === !0 && opts.type !== "log" && (min = Math.min(min, 0), max = Math.max(max, 0)), opts.type === "log")
        return new LogScale({
          domain: [min, max],
          range,
          reversed
        });
      if (opts.type === "datetime") {
        let { ticks, format } = niceDateTicks(min, max);
        return new LinearScale({
          domain: [min, max],
          range,
          reversed,
          ticks,
          format: (v) => formatDate(v, format),
          nice: opts.min === void 0 && opts.max === void 0
        });
      }
      return new LinearScale({
        domain: [min, max],
        range,
        tickCount: opts.tickCount,
        ...reversed ? { reversed } : {},
        nice: opts.min === void 0 && opts.max === void 0
      });
    }, horizontalScale = (list, opts, cats, range) => cats ? new CategoryScale({ categories: cats, range, reversed: opts.reversed }) : numericScale(list, opts, range, opts.reversed);
    if (inverted) {
      let xScale3 = this.valueScale(
        yAxisOpts,
        [vMin, vMax],
        [plot.x, plot.x + plot.width],
        !0,
        preservePrimaryZeroMin
      ), yScale3 = categories ? new CategoryScale({
        categories,
        range: [plot.y, plot.y + plot.height],
        reversed: xAxisOpts.reversed
      }) : numericScale(
        primaryXSource.length ? primaryXSource : xSource,
        xAxisOpts,
        [plot.y, plot.y + plot.height],
        xAxisOpts.reversed
      );
      return { xScale: xScale3, yScale: yScale3 };
    }
    let xRange = [plot.x, plot.x + plot.width], primaryX = primaryXSource.length ? primaryXSource : xSource, xScale = horizontalScale(primaryX, xAxisOpts, categories, xRange), xScale2 = secondaryXSource.length ? horizontalScale(
      secondaryXSource,
      xAxisOpts2,
      this.currentCategories(secondaryXSource, 1),
      xRange
    ) : void 0, yScale = this.valueScale(
      yAxisOpts,
      [vMin, vMax],
      [plot.y + plot.height, plot.y],
      !0,
      preservePrimaryZeroMin
    ), yScale2;
    if (hasSecondary) {
      let secondaryVisible = ySource.filter(onSecondary), [vMin2, vMax2] = this.valueDomain(secondaryVisible), preserveSecondaryZeroMin = this.hasNonNegativeColumnsOrBars(
        secondaryVisible,
        vMin2
      ), includeZero2 = secondaryVisible.some(
        (s) => [
          "column",
          "bar",
          "area",
          "areaspline",
          "errorbar",
          "lollipop"
        ].includes(s.type)
      ), secondaryOpts = axisAt(this.options.yAxis, 1);
      (includeZero2 || secondaryOpts.startOnZero === !0) && secondaryOpts.type !== "log" && (vMin2 = Math.min(vMin2, 0), vMax2 = Math.max(vMax2, 0)), yScale2 = this.valueScale(
        axisAt(this.options.yAxis, 1),
        [vMin2, vMax2],
        [plot.y + plot.height, plot.y],
        !0,
        preserveSecondaryZeroMin
      );
    }
    return { xScale, xScale2, yScale, yScale2 };
  }
  valueScale(opts, domain, range, padDomain = !0, preserveZeroMin = !1) {
    let min = opts.min ?? domain[0], max = opts.max ?? domain[1];
    if (opts.type === "log")
      return padDomain && opts.min === void 0 && (min /= 1 + VALUE_DOMAIN_PADDING), padDomain && opts.max === void 0 && (max *= 1 + VALUE_DOMAIN_PADDING), new LogScale({
        domain: [min, max],
        range,
        reversed: opts.reversed
      });
    if (padDomain) {
      let padding = (max - min || Math.abs(max) || Math.abs(min) || 1) * VALUE_DOMAIN_PADDING;
      opts.min === void 0 && !(preserveZeroMin && min === 0) && (min -= padding), opts.max === void 0 && (max += padding);
    }
    return new LinearScale({
      domain: [min, max],
      range,
      tickCount: opts.tickCount ?? 4,
      reversed: opts.reversed,
      niceMin: opts.min === void 0,
      niceMax: opts.max === void 0
    });
  }
  valueDomain(visible) {
    let mins = [], maxs = [];
    for (let s of visible) {
      if (!s.capabilities().cartesian) continue;
      let [lo, hi] = s.valueExtent();
      mins.push(lo), maxs.push(hi);
    }
    return mins.length ? [Math.min(...mins), Math.max(...maxs)] : [0, 1];
  }
  hasNonNegativeColumnsOrBars(series, domainMin) {
    return domainMin >= 0 && series.some((item) => item.type === "column" || item.type === "bar");
  }
  xNumericDomain(visible) {
    let xs = [];
    for (let s of visible)
      for (let p of s.points) typeof p.x == "number" && xs.push(p.x);
    return xs.length ? extent(xs) : [0, 1];
  }
  static {
    /**
     * Series types that need a banded (categorical) x-axis so bars get a real
     * width. Continuous types (line/area/scatter/bubble/histogram) stay numeric.
     */
    this.BANDED = /* @__PURE__ */ new Set([
      "column",
      "bar",
      "boxplot",
      "candlestick",
      "waterfall",
      "columnrange",
      "errorbar",
      "bullet",
      "dumbbell",
      "butterfly",
      "lollipop",
      "tick"
    ]);
  }
  currentCategories(visible, axisIndex = 0) {
    let xAxis = axisAt(this.options.xAxis, axisIndex);
    if (xAxis?.categories) return xAxis.categories;
    let banded = xAxis?.type === "category" || xAxis?.type !== "datetime" && visible.some((s) => _FacetViz.BANDED.has(s.type));
    if (visible.every(
      (s) => s.points.every((p) => typeof p.x == "number")
    ) && !banded) return;
    let seen = /* @__PURE__ */ new Set(), cats = [];
    for (let s of visible)
      for (let p of s.points) {
        let key = String(p.x);
        seen.has(key) || (seen.add(key), cats.push(key));
      }
    return cats;
  }
  // -- Stacking & grouping ----------------------------------------------
  groupInfo(visible) {
    let columnKeys = [], index = /* @__PURE__ */ new Map();
    for (let s of visible) {
      if (!s.capabilities().grouped) continue;
      if (s.options.grouping === !1 && !s.options.stacking) {
        index.set(s.index, -1);
        continue;
      }
      let key = s.options.stacking ? `stack:${s.options.stack ?? "default"}` : `series:${s.index}`, ci = columnKeys.indexOf(key);
      ci === -1 && (ci = columnKeys.length, columnKeys.push(key)), index.set(s.index, ci);
    }
    return { count: Math.max(1, columnKeys.length), index };
  }
  // -- Series render context --------------------------------------------
  seriesContext(s, plot, xScale, yScale, group, inverted, polar) {
    let rawIndex = group.index.get(s.index) ?? 0, overlapped = rawIndex === -1;
    return {
      renderer: this.renderer,
      plot,
      xScale,
      yScale,
      color: s.color,
      colors: this.colors,
      inverted,
      polar,
      groupCount: overlapped ? 1 : group.count,
      groupIndex: overlapped ? 0 : rawIndex,
      onPointEvent: (kind, p, dom) => this.handlePointEvent(kind, s, p, dom),
      registerHover: (el, p) => this.bindPointInteraction(el, s, p),
      suppressDataLabels: this.suppressDataLabels()
    };
  }
  bindPointInteraction(el, s, p) {
    if (this.applyHover(el, s), this.bindPointAccessibility(el, s, p), !this.tooltip) return;
    let total = s.points.reduce((sum2, pt) => sum2 + (pt.y ?? 0), 0), build = () => {
      let ctx = {
        series: s.name,
        x: p.name ?? p.x,
        y: p.y ?? p.high,
        name: p.name ?? p.x,
        index: p.index,
        total,
        percentage: total ? (p.y ?? 0) / total * 100 : void 0,
        low: p.low,
        high: p.high,
        box: p.box,
        point: p.options,
        color: p.color ?? s.color
      };
      return this.options.tooltip?.shared && (ctx.points = this.pointsAtX(p.x)), ctx;
    };
    el.addEventListener("mouseenter", () => {
      this.tooltip.show(build(), s.options.tooltip), this.showCrosshair(s, p);
    }), el.addEventListener(
      "mousemove",
      (e) => this.tooltip.move(e.clientX, e.clientY)
    ), el.addEventListener("mouseleave", () => {
      this.tooltip.hide(), this.hideCrosshair();
    }), this.options.accessibility?.enabled !== !1 && this.options.accessibility?.keyboardNavigation !== !1 && (el.addEventListener("focus", () => {
      this.tooltip.show(build(), s.options.tooltip);
      let rect = el.getBoundingClientRect();
      this.tooltip.move(rect.left + rect.width / 2, rect.top + rect.height / 2), this.showCrosshair(s, p);
    }), el.addEventListener("blur", () => {
      this.tooltip.hide(), this.hideCrosshair();
    }));
  }
  /** Add point semantics plus one-tab-stop, arrow-key navigation. */
  bindPointAccessibility(el, s, p) {
    let accessibility = this.options.accessibility;
    if (accessibility?.enabled === !1) return;
    if (this.accessiblePoints.some(
      (entry) => entry.series === s && entry.point === p
    )) {
      el.setAttribute("aria-hidden", "true");
      return;
    }
    if (this.accessiblePoints.push({ el, series: s, point: p }), el.classList.add("facet-a11y-point"), el.setAttribute("role", "img"), el.setAttribute("aria-roledescription", "data point"), el.setAttribute("aria-label", this.pointAccessibilityLabel(s, p)), accessibility?.keyboardNavigation === !1) return;
    el.setAttribute("tabindex", this.accessiblePoints.length === 1 ? "0" : "-1"), el.setAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space"
    );
    let activate = () => {
      for (let entry of this.accessiblePoints)
        entry.el.setAttribute("tabindex", entry.el === el ? "0" : "-1");
    };
    el.addEventListener("focus", activate), el.addEventListener("pointerdown", activate), el.addEventListener("keydown", (event) => {
      let points = this.accessiblePoints.filter((entry) => entry.el.isConnected), current = points.findIndex((entry) => entry.el === el);
      if (current < 0) return;
      let target = current;
      if (event.key === "ArrowRight" || event.key === "ArrowDown")
        target = (current + 1) % points.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        target = (current - 1 + points.length) % points.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = points.length - 1;
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(), this.handlePointEvent("click", s, p, event);
        return;
      } else return;
      event.preventDefault();
      for (let entry of points) entry.el.setAttribute("tabindex", "-1");
      points[target].el.setAttribute("tabindex", "0"), points[target].el.focus();
    });
  }
  /** Human-readable fallback for standard and specialised point shapes. */
  pointAccessibilityLabel(s, p) {
    let context = {
      seriesName: s.name,
      seriesIndex: s.index,
      pointIndex: p.index,
      x: p.x,
      y: p.y,
      low: p.low,
      high: p.high,
      point: p.options
    }, custom = this.options.accessibility?.pointDescriptionFormatter?.(context);
    if (custom) return custom;
    let o = p.options, prefix = `${s.name}, ${p.name ?? p.x}`;
    return p.box ? `${prefix}: minimum ${p.box.min}, lower quartile ${p.box.q1}, median ${p.box.median}, upper quartile ${p.box.q3}, maximum ${p.box.max}` : p.low !== void 0 || p.high !== void 0 ? `${prefix}: low ${p.low ?? "unknown"}, high ${p.high ?? "unknown"}` : o.from !== void 0 || o.to !== void 0 ? `${s.name}: ${String(o.from ?? "unknown")} to ${String(o.to ?? "unknown")}, weight ${String(o.weight ?? p.y ?? "unknown")}` : o.open !== void 0 || o.close !== void 0 ? `${prefix}: open ${String(o.open ?? "unknown")}, high ${String(o.high ?? "unknown")}, low ${String(o.low ?? "unknown")}, close ${String(o.close ?? "unknown")}` : o.start !== void 0 || o.end !== void 0 ? `${prefix}: start ${String(o.start ?? "unknown")}, end ${String(o.end ?? "unknown")}` : o.value !== void 0 ? `${prefix}: ${String(o.value)}` : p.y !== void 0 ? `${prefix}: ${p.y}` : prefix;
  }
  /** Draw a guide line at the hovered point when `xAxis.crosshair` is on. */
  showCrosshair(s, p) {
    let ctx = this.plotCtx, axisIndex = s.options.xAxis ?? 0;
    if (!axisAt(this.options.xAxis, axisIndex).crosshair || !ctx || ctx.inverted)
      return;
    this.hideCrosshair();
    let scale = axisIndex === 1 ? ctx.xScale2 : ctx.xScale;
    if (!scale) return;
    let x = scale.scale(p.x);
    this.crosshairEl = this.renderer.create(
      "line",
      {
        x1: x,
        y1: ctx.plot.y,
        x2: x,
        y2: ctx.plot.y + ctx.plot.height,
        stroke: this.theme.axis.labelColor,
        "stroke-width": 1,
        "stroke-dasharray": "3 3",
        "pointer-events": "none",
        class: "facet-crosshair"
      },
      this.renderer.root
    );
  }
  hideCrosshair() {
    this.crosshairEl?.remove(), this.crosshairEl = void 0;
  }
  /** All visible series' points sharing an x value (for the shared tooltip). */
  pointsAtX(x) {
    let rows = [];
    for (let s of this.series) {
      if (!s.visible || !s.capabilities().cartesian) continue;
      let match = s.points.find((pp) => String(pp.x) === String(x));
      match && rows.push({
        series: s.name,
        x: match.name ?? match.x,
        y: match.y ?? match.high,
        low: match.low,
        high: match.high,
        point: match.options,
        color: match.color ?? s.color
      });
    }
    return rows;
  }
  /**
   * Subtle hover highlight (brightness only). Scaling was reverted — it looked
   * jarring — but remains opt-in via `states.hover.scale` for anyone who wants it.
   */
  applyHover(el, s) {
    let hover = s.options.states?.hover;
    if (hover?.enabled === !1) return;
    let scale = hover?.scale ?? 0, brightness = hover?.brightness ?? 0.08, style = el.style;
    style.transition = "filter 0.12s ease", el.addEventListener("mouseenter", () => {
      style.filter = `brightness(${1 + brightness})`, scale && (style.transformBox = "fill-box", style.transformOrigin = "center", style.transition = "transform 0.12s ease, filter 0.12s ease", style.transform = `scale(${scale})`);
    }), el.addEventListener("mouseleave", () => {
      style.filter = "", scale && (style.transform = "");
    });
  }
  handlePointEvent(kind, s, p, dom) {
    let payload = {
      type: kind,
      seriesName: s.name,
      seriesIndex: s.index,
      pointIndex: p.index,
      x: p.x,
      y: p.y,
      point: p.options,
      domEvent: dom
    };
    this.events.emit(`point:${kind}`, payload);
    let se = this.options.seriesEvents;
    if (kind === "click") {
      se?.click?.(payload), this.options.chart?.events?.click?.(payload);
      let ddId = p.options.drilldown;
      typeof ddId == "string" && this.drillTo(ddId);
    }
    kind === "mouseOver" && se?.mouseOver?.(payload), kind === "mouseOut" && se?.mouseOut?.(payload);
  }
  /** Replace the series with the matching drilldown series (click-to-expand). */
  drillTo(id) {
    let dd = this.options.drilldown?.series.find((s) => s.id === id);
    if (!dd) return;
    this.drillStack.push({
      series: this.options.series,
      title: this.options.title,
      xAxis: this.options.xAxis
    }), this.options.series = [dd], dd.name && (this.options.title = { text: dd.name });
    let xa = axisAt(this.options.xAxis, 0), { categories, ...rest } = xa;
    this.options.xAxis = rest, this.build(), this.animateNext = !0, this.render(), this.events.emit("drilldown", { id, series: dd });
  }
  /** Return to the previous level after a drill-down. */
  drillUp() {
    let prev = this.drillStack.pop();
    prev && (this.options.series = prev.series, this.options.title = prev.title, this.options.xAxis = prev.xAxis, this.build(), this.animateNext = !0, this.render(), this.events.emit("drillup", {}));
  }
  /** Breadcrumb "← Back" control shown while drilled in. */
  drawDrillUp(outer) {
    if (!this.drillStack.length) return;
    let g = this.renderer.group(
      { class: "facet-drillup", style: "cursor:pointer" },
      this.renderer.root
    ), bx = outer.x, by = outer.y + 2;
    this.renderer.create(
      "rect",
      {
        x: bx,
        y: by,
        width: 62,
        height: 22,
        rx: 5,
        fill: this.theme.tooltip.backgroundColor,
        stroke: THEME.axis.lineColor
      },
      g
    ), this.renderer.text(
      "\u2190 Back",
      bx + 31,
      by + 15,
      {
        "text-anchor": "middle",
        ...FONTS.axisLabel,
        fill: this.theme.axis.labelColor
      },
      g
    ), g.addEventListener("click", () => this.drillUp());
  }
  // -- Legend / visibility ----------------------------------------------
  /** Resolve where the legend sits from its layout/align/verticalAlign options. */
  legendPlacement() {
    let l = this.options.legend ?? {};
    return l.layout === "vertical" ? l.align === "left" ? "left" : "right" : l.verticalAlign === "top" ? "top" : "bottom";
  }
  /** True when the legend represents the points of a single non-cartesian
   *  series (pie / donut / radial bar) rather than one item per series. */
  isPointLegend() {
    let first = this.series[0];
    return this.series.length === 1 && !!first && first.capabilities().pointLegend === !0;
  }
  buildLegendItems() {
    let first = this.series[0];
    if (this.series.length === 1 && first?.options.showInLegend === !1)
      return [];
    if (this.series.length === 1 && first?.legendItems) {
      let custom = first.legendItems(this.colors);
      if (custom) return custom;
    }
    return this.isPointLegend() && first ? first.points.map((p, i) => ({
      label: String(p.name ?? p.x),
      color: p.color ?? paletteColor(this.colors, i),
      visible: !first.hiddenPoints.has(p.index)
    })) : this.series.map((s, seriesIndex) => ({
      label: s.name,
      color: s.color,
      visible: s.visible,
      seriesIndex
    })).filter(
      (_, seriesIndex) => this.series[seriesIndex].options.showInLegend !== !1
    );
  }
  toggleSeries(index) {
    let first = this.series[0];
    if (this.series.length === 1 && first?.legendItems && first.onLegendToggle && first.legendItems(this.colors)) {
      first.onLegendToggle(index);
      let toggled = first.legendItems(this.colors)?.[index];
      toggled && this.options.seriesEvents?.legendItemClick?.({
        series: toggled.label,
        visible: toggled.visible
      }), this.render();
      return;
    }
    if (this.isPointLegend()) {
      let p = first.points[index];
      if (!p) return;
      first.hiddenPoints.has(p.index) ? first.hiddenPoints.delete(p.index) : first.hiddenPoints.add(p.index), this.options.seriesEvents?.legendItemClick?.({
        series: String(p.name ?? p.x),
        visible: !first.hiddenPoints.has(p.index)
      }), this.render();
      return;
    }
    let seriesIndex = this.buildLegendItems()[index]?.seriesIndex ?? index, s = this.series[seriesIndex];
    s && (s.visible = !s.visible, this.options.seriesEvents?.legendItemClick?.({
      series: s.name,
      visible: s.visible
    }), this.render());
  }
  // -- Public API --------------------------------------------------------
  /** Register a chart/point event callback. Returns an unsubscribe fn. */
  on(event, listener) {
    return this.events.on(event, listener);
  }
  /**
   * Coalesce synchronous mutations into one validation, rebuild, and render.
   * Nested batches are supported. If the callback throws,
   * every mutation made within that batch level is rolled back.
   */
  batchUpdate(callback) {
    if (this.destroyed) return;
    let checkpoint = {
      userOptions: this.userOptions,
      dirty: this.batchDirty,
      preserveSeriesState: this.batchPreserveSeriesState,
      preserveAxisRange: this.batchPreserveAxisRange,
      needsReflow: this.batchNeedsReflow,
      animate: this.batchAnimate
    };
    this.batchCheckpoints.push(checkpoint), this.batchDepth += 1;
    let active = !0;
    try {
      let result2 = callback(this);
      if (result2 && typeof result2.then == "function")
        throw new TypeError("FacetViz.batchUpdate() callback must be synchronous.");
      this.batchDepth -= 1, this.batchCheckpoints.pop(), active = !1, this.batchDepth === 0 && this.flushBatch();
    } catch (error) {
      throw active && (this.batchDepth -= 1, this.batchCheckpoints.pop()), this.userOptions = checkpoint.userOptions, this.batchDirty = checkpoint.dirty, this.batchPreserveSeriesState = checkpoint.preserveSeriesState, this.batchPreserveAxisRange = checkpoint.preserveAxisRange, this.batchNeedsReflow = checkpoint.needsReflow, this.batchAnimate = checkpoint.animate, error;
    }
  }
  /**
   * Merge new options and re-render (rebuilds series when `series` is
   * given). `theme` is re-resolved too — previously it was only read once,
   * in the constructor, so `update({ theme })` silently had no effect.
   */
  update(options) {
    if (this.destroyed) return;
    let nextOptions = merge(this.userOptions, options);
    this.commitOptions(nextOptions, {
      preserveSeriesState: options.series === void 0,
      preserveAxisRange: options.xAxis === void 0 && options.yAxis === void 0,
      setupReflow: !0,
      animate: !0
    });
  }
  /** Replace one series' data in place and re-render (incremental update). */
  setData(seriesIndex, data) {
    if (this.destroyed || !this.userOptions.series[seriesIndex]) return;
    let nextOptions = {
      ...this.userOptions,
      series: this.userOptions.series.map(
        (series, index) => index === seriesIndex ? { ...series, data } : series
      )
    };
    this.commitOptions(nextOptions, {
      preserveSeriesState: !0,
      preserveAxisRange: !0,
      setupReflow: !1,
      animate: !0
    });
  }
  /** Append a point to a series and re-render. */
  addPoint(seriesIndex, point) {
    this.appendData(seriesIndex, [point]);
  }
  /**
   * Append multiple raw source points, optionally retaining only a bounded
   * rolling window. Use batchUpdate() to append to several series atomically.
   */
  appendData(seriesIndex, points, options = {}) {
    if (this.destroyed || points.length === 0) return;
    let opts = this.userOptions.series[seriesIndex];
    if (!opts) return;
    let maxPoints = options.maxPoints;
    if (maxPoints !== void 0 && (!Number.isSafeInteger(maxPoints) || maxPoints <= 0))
      throw new RangeError("FacetViz.appendData(): maxPoints must be a positive integer.");
    let data = [...opts.data, ...points];
    maxPoints !== void 0 && data.length > maxPoints && (data = data.slice(data.length - maxPoints));
    let nextOptions = {
      ...this.userOptions,
      series: this.userOptions.series.map(
        (series, index) => index === seriesIndex ? { ...series, data } : series
      )
    };
    this.commitOptions(nextOptions, {
      preserveSeriesState: !0,
      preserveAxisRange: !0,
      setupReflow: !1,
      animate: !0
    });
  }
  setSize(width, height) {
    if (this.destroyed) return;
    let nextOptions = {
      ...this.userOptions,
      chart: { ...this.userOptions.chart ?? {}, width, height }
    };
    this.commitOptions(nextOptions, {
      preserveSeriesState: !0,
      preserveAxisRange: !0,
      setupReflow: !0,
      animate: !1
    });
  }
  /**
   * The legend entries this chart will actually draw. Point-legend types
   * use one entry per point when configured with one series; multi-series
   * charts such as stacked radial bars use one entry per series. Check
   * `legendItems.length`/`hasLegend` to decide whether a legend is meaningful.
   */
  get legendItems() {
    return this.buildLegendItems();
  }
  /** Whether a legend will actually render (respects `legend.enabled` and needs >1 entry). */
  get hasLegend() {
    return this.options.legend?.enabled !== !1 && this.buildLegendItems().length > 1;
  }
  /** Serialise the chart to a standalone SVG string. */
  getSVG() {
    return serializeSVG(this.renderer, this.width, this.height);
  }
  /** Trigger a download of the chart as an SVG file. */
  downloadSVG(filename = "chart.svg") {
    downloadBlob(
      new Blob([this.getSVG()], { type: "image/svg+xml" }),
      filename
    );
  }
  /** Rasterise to PNG (`scale`× resolution) and download. */
  async downloadPNG(filename = "chart.png", scale = 2) {
    let blob = await this.toPNGBlob(scale);
    blob && downloadBlob(blob, filename);
  }
  /** Rasterise the chart to a PNG Blob. */
  toPNGBlob(scale = 2) {
    return rasterizePNG(
      this.getSVG(),
      this.width,
      this.height,
      this.options.chart?.backgroundColor ?? this.theme.backgroundColor,
      scale
    );
  }
  destroy() {
    this.destroyed || (this.destroyed = !0, this.initialReflowFrame !== void 0 && cancelAnimationFrame(this.initialReflowFrame), this.resizeFrame !== void 0 && cancelAnimationFrame(this.resizeFrame), this.initialReflowFrame = void 0, this.resizeFrame = void 0, this.boostHoverCleanups.forEach((cleanup) => cleanup()), this.boostHoverCleanups = [], this.tooltip?.destroy(), this.resizeObserver?.disconnect(), this.events.clear(), this.renderer?.root.remove());
  }
};

// src/core/table.ts
var FacetTable = class {
  constructor(container, options) {
    this.charts = [];
    this.currentPage = 1;
    this.currentPageSize = 25;
    this.currentFilters = /* @__PURE__ */ new Map();
    this.destroyed = !1;
    let element = typeof container == "string" ? document.querySelector(container) : container;
    if (!element) throw new Error("FacetTable: container element not found");
    if (!options.columns.length)
      throw new Error("FacetTable: at least one column is required");
    this.container = element, this.options = { ...options, rows: [...options.rows], columns: [...options.columns] }, this.currentSort = initialSort(this.options.columns), this.currentFilters = initialFilters(this.options.columns), this.syncPagination(options.pagination, !0), this.render(), this.setupReflow();
  }
  /** Replace all table rows and their cell charts. */
  setRows(rows) {
    this.destroyed || (this.options = { ...this.options, rows: [...rows] }, this.sharedDomainCache = void 0, this.clampPage(), this.render());
  }
  /** Merge table-level options and rebuild the affected cells. */
  update(options) {
    if (this.destroyed) return;
    let next = {
      ...this.options,
      ...options,
      rows: options.rows ? [...options.rows] : this.options.rows,
      columns: options.columns ? [...options.columns] : this.options.columns
    };
    if (!next.columns.length)
      throw new Error("FacetTable: at least one column is required");
    this.options = next, (options.rows !== void 0 || options.columns !== void 0) && (this.sharedDomainCache = void 0), options.pagination !== void 0 && this.syncPagination(options.pagination, !1), options.columns !== void 0 && ((this.currentSort ? this.options.columns.find((column) => column.key === this.currentSort?.key) : void 0)?.sortable || (this.currentSort = initialSort(this.options.columns)), this.currentFilters = reconcileFilters(
      this.currentFilters,
      this.options.columns
    )), this.clampPage(), this.render();
  }
  /** Current 1-based page (always `1` when pagination is disabled). */
  get page() {
    return this.paginationOptions() ? this.currentPage : 1;
  }
  get pageSize() {
    return this.currentPageSize;
  }
  get pageCount() {
    return this.paginationOptions() ? Math.max(1, Math.ceil(this.filteredRows().length / this.currentPageSize)) : 1;
  }
  get sort() {
    return this.currentSort ? { ...this.currentSort } : void 0;
  }
  get filters() {
    return [...this.currentFilters].map(([key, value]) => ({ key, value }));
  }
  setFilter(key, value) {
    if (this.destroyed) return;
    if (!this.options.columns.find((candidate) => candidate.key === key)?.filterable)
      throw new Error(`FacetTable.setFilter(): column "${key}" is not filterable.`);
    let normalized = value?.trim() ?? "";
    normalized ? this.currentFilters.set(key, normalized) : this.currentFilters.delete(key), this.currentPage = 1, this.sharedDomainCache = void 0, this.render();
  }
  clearFilter(key) {
    this.destroyed || !this.currentFilters.has(key) || (this.currentFilters.delete(key), this.currentPage = 1, this.sharedDomainCache = void 0, this.render());
  }
  clearFilters() {
    this.destroyed || !this.currentFilters.size || (this.currentFilters.clear(), this.currentPage = 1, this.sharedDomainCache = void 0, this.render());
  }
  sortBy(key, direction = "asc") {
    if (this.destroyed) return;
    if (!this.options.columns.find((candidate) => candidate.key === key)?.sortable)
      throw new Error(`FacetTable.sortBy(): column "${key}" is not sortable.`);
    this.currentSort = { key, direction }, this.currentPage = 1, this.render();
  }
  clearSort() {
    this.destroyed || !this.currentSort || (this.currentSort = void 0, this.currentPage = 1, this.render());
  }
  setPage(page) {
    if (this.destroyed || !this.paginationOptions()) return;
    let next = clampInteger(page, 1, this.pageCount, "FacetTable.setPage(): page");
    next !== this.currentPage && (this.currentPage = next, this.render(), this.paginationOptions()?.onPageChange?.(this.currentPage, this.currentPageSize));
  }
  setPageSize(pageSize) {
    if (this.destroyed || !this.paginationOptions()) return;
    let next = positiveInteger(pageSize, "FacetTable.setPageSize(): pageSize");
    next !== this.currentPageSize && (this.currentPageSize = next, this.currentPage = 1, this.render(), this.paginationOptions()?.onPageChange?.(this.currentPage, this.currentPageSize));
  }
  /** Re-measure all mounted cell charts after an outer layout change. */
  reflow() {
    this.destroyed || this.charts.forEach((chart) => chart.reflow());
  }
  destroy() {
    this.destroyed || (this.destroyed = !0, this.destroyCharts(), this.resizeObserver?.disconnect(), this.resizeObserver = void 0, this.resizeFrame !== void 0 && cancelAnimationFrame(this.resizeFrame), this.resizeFrame = void 0, this.root?.remove(), this.root = void 0, this.table = void 0);
  }
  render() {
    this.destroyCharts(), this.clampPage();
    let root = document.createElement("div");
    root.className = "facet-table-root", root.style.width = "100%";
    let layout = this.options.layout;
    (layout?.freezeHeaderRow || layout?.freezeFirstColumn) && (root.style.overflow = "auto"), applyStyle(root, this.options.style?.root);
    let table = document.createElement("table");
    table.className = ["facet-table", this.options.className].filter(Boolean).join(" "), table.style.width = "100%";
    let needsStickyLayout = layout?.freezeHeaderRow || layout?.freezeFirstColumn;
    table.style.borderCollapse = needsStickyLayout ? "separate" : "collapse", needsStickyLayout && (table.style.borderSpacing = "0"), table.style.tableLayout = layout?.tableLayout ?? "auto";
    let borders = this.options.appearance?.borders;
    if (borders?.outsideBorder && (table.style.borderStyle = "solid", table.style.borderColor = borders.borderColor ?? "#e5e7eb", table.style.borderWidth = cssLength(borders.borderWidth ?? 1)), applyStyle(table, this.options.style?.table), this.options.caption) {
      let caption = document.createElement("caption");
      caption.textContent = this.options.caption, caption.style.textAlign = "left", caption.style.padding = "0 0 8px", applyStyle(caption, this.options.style?.caption), table.appendChild(caption);
    }
    layout?.showHeaderRow !== !1 && table.appendChild(this.renderHead());
    let { body, pending } = this.renderBody();
    table.appendChild(body), root.appendChild(table);
    let pagination = this.renderPagination();
    pagination && root.appendChild(pagination), this.container.replaceChildren(root), this.root = root, this.table = table;
    let sharedDomains = this.sharedDomainCache ?? this.sharedDomains();
    this.sharedDomainCache = sharedDomains;
    for (let item of pending) {
      let domain = sharedDomains.get(item.columnIndex);
      this.charts.push(this.mountChart(item, domain));
    }
  }
  renderHead() {
    let head = document.createElement("thead");
    applyStyle(head, this.options.style?.head);
    let row = document.createElement("tr");
    applyStyle(row, this.options.style?.headerRow);
    for (let [columnIndex, column] of this.options.columns.entries()) {
      let cell = document.createElement("th");
      if (cell.scope = "col", cell.className = column.chart ? "facet-table-heading facet-table-chart-heading" : "facet-table-heading", this.styleCell(cell, column, !0, void 0, columnIndex), this.applyColumnStyle(cell, column, !0), column.sortable || column.filterable) {
        let controls = document.createElement("div");
        if (controls.className = "facet-table-header-controls", controls.style.display = "flex", controls.style.alignItems = "center", controls.style.gap = "5px", controls.style.width = "100%", applyStyle(controls, this.options.style?.headerControls), column.sortable) {
          let direction = this.currentSort?.key === column.key ? this.currentSort.direction : void 0;
          cell.setAttribute(
            "aria-sort",
            direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"
          );
          let button = document.createElement("button");
          button.type = "button", button.className = "facet-table-sort-button", button.style.display = "inline-flex", button.style.alignItems = "center", button.style.justifyContent = sortAlignment(
            this.cellHorizontalAlignment(column, !0)
          ), button.style.gap = "5px", button.style.flex = "1 1 auto", button.style.minWidth = "0", button.style.padding = "0", button.style.border = "0", button.style.background = "transparent", button.style.color = "inherit", button.style.font = "inherit", button.style.cursor = "pointer", button.append(document.createTextNode(column.header ?? column.key)), applyStyle(button, this.options.style?.sortButton);
          let indicator = createSortIndicator(direction);
          indicator.setAttribute("class", "facet-table-sort-indicator"), indicator.style.opacity = direction ? "1" : "0.5", applyStyle(indicator, this.options.style?.sortIndicator), button.appendChild(indicator), button.addEventListener("click", () => this.toggleSort(column)), controls.appendChild(button);
        } else {
          let label = document.createElement("span");
          label.className = "facet-table-heading-label", label.textContent = column.header ?? column.key, label.style.flex = "1 1 auto", label.style.minWidth = "0", controls.appendChild(label);
        }
        column.filterable && (cell.style.position || (cell.style.position = "relative"), controls.appendChild(this.renderFilterControl(column, columnIndex))), cell.appendChild(controls);
      } else
        cell.textContent = column.header ?? column.key;
      row.appendChild(cell);
    }
    return head.appendChild(row), head;
  }
  renderFilterControl(column, columnIndex) {
    let wrapper = document.createElement("span");
    wrapper.className = "facet-table-filter", wrapper.style.display = "inline-flex", wrapper.style.position = "relative", wrapper.style.flex = "0 0 auto";
    let activeValue = this.currentFilters.get(column.key) ?? "", panelId = `facet-table-filter-${columnIndex}-${filterIdCounter++}`, button = document.createElement("button");
    button.type = "button", button.className = "facet-table-filter-button", button.classList.toggle("is-active", !!activeValue), button.dataset.active = String(!!activeValue), button.setAttribute("aria-label", `Filter ${column.header ?? column.key}`), button.setAttribute("aria-expanded", "false"), button.setAttribute("aria-controls", panelId), button.style.display = "inline-flex", button.style.alignItems = "center", button.style.justifyContent = "center", button.style.width = "24px", button.style.height = "24px", button.style.padding = "3px", button.style.border = "0", button.style.borderRadius = "4px", button.style.background = activeValue ? "var(--facet-table-filter-active-background, #eef2ff)" : "transparent", button.style.color = activeValue ? "var(--facet-table-filter-active-color, #4f46e5)" : "inherit", button.style.cursor = "pointer", applyStyle(button, this.options.style?.filterButton), activeValue && applyStyle(button, this.options.style?.activeFilterButton);
    let indicator = createFilterIndicator();
    indicator.setAttribute("class", "facet-table-filter-indicator"), applyStyle(indicator, this.options.style?.filterIndicator), button.appendChild(indicator);
    let panel = document.createElement("form");
    panel.id = panelId, panel.className = "facet-table-filter-panel", panel.hidden = !0, panel.style.position = "absolute", panel.style.top = "calc(100% + 5px)", panel.style.right = "0", panel.style.zIndex = "20", panel.style.width = "220px", panel.style.padding = "8px", panel.style.border = "1px solid var(--facet-table-border-color, #d1d5db)", panel.style.borderRadius = "6px", panel.style.background = "var(--facet-table-filter-background, Canvas)", panel.style.color = "var(--facet-table-filter-color, CanvasText)", panel.style.fontWeight = "400", panel.style.fontStyle = "normal", panel.style.textAlign = "left", panel.style.textTransform = "none", panel.style.letterSpacing = "normal", panel.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.16)", applyStyle(panel, this.options.style?.filterPanel);
    let filterOptions = typeof column.filterable == "object" ? column.filterable : void 0, input = document.createElement("input");
    input.type = "search", input.className = "facet-table-filter-input", input.value = activeValue, input.placeholder = filterOptions?.placeholder ?? "Filter\u2026", input.setAttribute("aria-label", `Filter value for ${column.header ?? column.key}`), input.style.width = "100%", input.style.padding = "6px 8px", input.style.border = "1px solid var(--facet-table-border-color, #d1d5db)", input.style.borderRadius = "4px", input.style.background = "var(--facet-table-filter-input-background, Canvas)", input.style.color = "inherit", input.style.font = "inherit", applyStyle(input, this.options.style?.filterInput), panel.appendChild(input);
    let actions = document.createElement("span");
    actions.className = "facet-table-filter-actions", actions.style.display = "flex", actions.style.justifyContent = "flex-end", actions.style.gap = "6px", actions.style.marginTop = "8px", applyStyle(actions, this.options.style?.filterActions);
    let clear = filterActionButton("Clear", this.options.style?.filterActionButton), apply = filterActionButton("Apply", this.options.style?.filterActionButton);
    return apply.type = "submit", apply.style.background = "var(--facet-table-filter-apply-background, #4f46e5)", apply.style.color = "var(--facet-table-filter-apply-color, #fff)", actions.append(clear, apply), panel.appendChild(actions), button.addEventListener("click", () => {
      panel.hidden = !panel.hidden, button.setAttribute("aria-expanded", String(!panel.hidden)), panel.hidden || input.focus();
    }), panel.addEventListener("submit", (event) => {
      event.preventDefault(), this.setFilter(column.key, input.value);
    }), clear.addEventListener("click", () => {
      input.value = "", this.currentFilters.has(column.key) ? this.clearFilter(column.key) : (panel.hidden = !0, button.setAttribute("aria-expanded", "false"), button.focus());
    }), input.addEventListener("keydown", (event) => {
      event.key === "Escape" && (panel.hidden = !0, button.setAttribute("aria-expanded", "false"), button.focus());
    }), wrapper.append(button, panel), wrapper;
  }
  renderBody() {
    let body = document.createElement("tbody"), bodyTextSize = this.options.layout?.bodyTextSize;
    bodyTextSize !== void 0 && (body.style.fontSize = cssLength(bodyTextSize)), applyStyle(body, this.options.style?.body);
    let pending = [], visibleRows = this.visibleRows();
    if (!visibleRows.length) {
      let row = document.createElement("tr"), cell = document.createElement("td");
      return cell.colSpan = this.options.columns.length, cell.textContent = this.options.emptyText ?? "No data", cell.className = "facet-table-empty", cell.style.padding = "12px 10px", cell.style.textAlign = "center", applyStyle(cell, this.options.style?.emptyCell), row.appendChild(cell), body.appendChild(row), { body, pending };
    }
    return visibleRows.forEach(({ row: dataRow, rowIndex }, visibleRowIndex) => {
      let row = document.createElement("tr"), rowType = tableRowType(dataRow);
      row.className = [
        "facet-table-row",
        rowType ? `facet-table-row-${rowType === "grandTotal" ? "grand-total" : rowType}` : ""
      ].filter(Boolean).join(" "), rowType && (row.dataset.rowType = rowType);
      let rowBackground = this.customizedRowBackground(visibleRowIndex);
      rowBackground && (row.style.backgroundColor = rowBackground);
      let summaryStyle = this.summaryRowStyle(rowType);
      applyStyle(row, summaryStyle);
      let rowStyle = resolveRowStyle(this.options.style?.row, dataRow, rowIndex);
      applyStyle(row, rowStyle);
      for (let [columnIndex, column] of this.options.columns.entries()) {
        let cell = document.createElement("td"), sourceValue = dataRow[column.key], descriptor = resolveCellDescriptor(sourceValue), value = descriptor ? descriptor.value : sourceValue;
        if (cell.className = column.chart ? "facet-table-cell facet-table-chart-cell" : "facet-table-cell", this.styleCell(cell, column, !1, value, columnIndex), this.styleBodyCell(
          cell,
          columnIndex,
          row.style.backgroundColor || rowBackground
        ), applyStyle(cell, summaryStyle), applyStyle(
          cell,
          resolveCellStyle(this.options.style?.cell, value, dataRow, rowIndex, column)
        ), applyStyle(
          cell,
          column.chart ? this.options.style?.chartCell : this.options.style?.valueCell
        ), applyStyle(cell, rowStyle), this.applyColumnStyle(cell, column, !1, value, dataRow, rowIndex), applyStyle(cell, descriptorStyle(descriptor)), column.chart) {
          let host = document.createElement("div");
          host.className = "facet-table-chart", host.style.width = "100%", host.style.height = `${column.chart.height ?? column.chart.options?.chart?.height ?? 44}px`, host.style.minWidth = `${column.chart.minWidth ?? 120}px`, applyStyle(host, this.options.style?.chartHost), cell.appendChild(host), pending.push({
            host,
            column,
            columnIndex,
            value,
            row: dataRow,
            rowIndex,
            series: this.cellSeries(column, value, dataRow, rowIndex)
          });
        } else
          this.renderValue(cell, column, value, dataRow, rowIndex, descriptor);
        row.appendChild(cell);
      }
      this.bindRowHover(row), body.appendChild(row);
    }), { body, pending };
  }
  summaryRowStyle(rowType) {
    if (!(!rowType || rowType === "detail"))
      return rowType === "grandTotal" ? {
        backgroundColor: "var(--facet-table-grand-total-background, color-mix(in srgb, Canvas 88%, #6366f1 12%))",
        fontWeight: 700,
        borderTop: "1px solid var(--facet-table-grand-total-border, color-mix(in srgb, CanvasText 24%, transparent))",
        ...this.options.style?.grandTotalRow
      } : {
        backgroundColor: "var(--facet-table-subtotal-background, color-mix(in srgb, Canvas 94%, #6366f1 6%))",
        fontWeight: 700,
        ...this.options.style?.subtotalRow
      };
  }
  visibleRows() {
    let rows = this.sortedRows(), pagination = this.paginationOptions(), start = pagination ? (this.currentPage - 1) * this.currentPageSize : 0, end = pagination ? Math.min(rows.length, start + this.currentPageSize) : rows.length;
    return rows.slice(start, end);
  }
  sortedRows() {
    let rows = this.filteredRows();
    if (!this.currentSort) return rows;
    let column = this.options.columns.find(
      (candidate) => candidate.key === this.currentSort?.key && candidate.sortable
    );
    if (!column) return rows;
    let sortOptions = typeof column.sortable == "object" ? column.sortable : void 0, direction = this.currentSort.direction === "asc" ? 1 : -1, compare = (a, b) => {
      let valueA = unwrapCellValue(a.row[column.key]), valueB = unwrapCellValue(b.row[column.key]), nullOrder = compareNullsLast(valueA, valueB);
      if (nullOrder !== void 0) return nullOrder || a.rowIndex - b.rowIndex;
      let compared = sortOptions?.compare ? sortOptions.compare(valueA, valueB, a.row, b.row) : compareTableValues(valueA, valueB), normalized = Number.isFinite(compared) ? compared : 0;
      return normalized === 0 ? a.rowIndex - b.rowIndex : normalized * direction;
    };
    return rows.some(({ row }) => isStructuredTableRow(row)) ? sortDetailRowsWithinGroups(rows, compare) : rows.sort(compare);
  }
  filteredRows() {
    return this.filteredSourceRows();
  }
  filteredSourceRows() {
    let rows = this.options.rows.map((row, rowIndex) => ({ row, rowIndex }));
    return this.currentFilters.size ? rows.filter(({ row, rowIndex }) => {
      for (let [key, filterValue] of this.currentFilters) {
        let column = this.options.columns.find(
          (candidate) => candidate.key === key && candidate.filterable
        );
        if (!column) continue;
        let value = unwrapCellValue(row[column.key]), filterOptions = typeof column.filterable == "object" ? column.filterable : void 0;
        if (!(filterOptions?.predicate ? filterOptions.predicate(value, filterValue, row, rowIndex) : String(value ?? "").toLocaleLowerCase().includes(
          filterValue.toLocaleLowerCase()
        ))) return !1;
      }
      return !0;
    }) : rows;
  }
  toggleSort(column) {
    let current = this.currentSort?.key === column.key ? this.currentSort.direction : void 0;
    this.currentSort = current === "asc" ? { key: column.key, direction: "desc" } : current === "desc" ? void 0 : { key: column.key, direction: "asc" }, this.currentPage = 1, this.render();
  }
  renderPagination() {
    let options = this.paginationOptions(), rowCount = this.filteredRows().length;
    if (!options || !rowCount) return;
    let canReducePageSize = options.showPageSize !== !1 && pageSizeChoices(options, this.currentPageSize).some(
      (size) => size < rowCount
    );
    if (!options.alwaysShow && this.pageCount <= 1 && !canReducePageSize)
      return;
    let labels = paginationLabels(options.labels), nav = document.createElement("nav");
    if (nav.className = "facet-table-pagination", nav.setAttribute("aria-label", "Table pagination"), nav.style.display = "flex", nav.style.alignItems = "center", nav.style.flexWrap = "wrap", nav.style.gap = "6px", nav.style.justifyContent = paginationAlignment(options.align), nav.style.padding = "10px 0 0", applyStyle(nav, this.options.style?.pagination), nav.appendChild(this.paginationButton(labels.first, 1, this.currentPage === 1)), nav.appendChild(
      this.paginationButton(labels.previous, this.currentPage - 1, this.currentPage === 1)
    ), options.showPageNumbers !== !1)
      for (let page of visiblePageNumbers(
        this.currentPage,
        this.pageCount,
        options.maxPageButtons ?? 5
      )) {
        let button = this.paginationButton(String(page), page, !1);
        button.classList.add("facet-table-page-button"), page === this.currentPage && (button.classList.add("is-active"), button.setAttribute("aria-current", "page"), button.style.background = "var(--facet-table-page-active-background, #6366f1)", button.style.color = "var(--facet-table-page-active-color, #fff)", applyStyle(button, this.options.style?.activePageButton)), nav.appendChild(button);
      }
    nav.appendChild(
      this.paginationButton(labels.next, this.currentPage + 1, this.currentPage === this.pageCount)
    ), nav.appendChild(
      this.paginationButton(labels.last, this.pageCount, this.currentPage === this.pageCount)
    );
    let info = document.createElement("span");
    if (info.className = "facet-table-pagination-info", info.textContent = `${labels.page} ${this.currentPage} ${labels.of} ${this.pageCount} \xB7 ${this.pageRangeText()} ${labels.rows}`, info.style.marginInline = "4px", applyStyle(info, this.options.style?.paginationInfo), nav.appendChild(info), options.showPageSize !== !1) {
      let label = document.createElement("label");
      label.className = "facet-table-page-size", label.style.display = "inline-flex", label.style.alignItems = "center", label.style.gap = "5px", label.append(document.createTextNode(`${labels.perPage} `)), applyStyle(label, this.options.style?.pageSizeLabel);
      let select = document.createElement("select");
      select.className = "facet-table-page-size-select", select.setAttribute("aria-label", labels.perPage);
      for (let size of pageSizeChoices(options, this.currentPageSize)) {
        let option = document.createElement("option");
        option.value = String(size), option.textContent = String(size), option.selected = size === this.currentPageSize, select.appendChild(option);
      }
      select.addEventListener("change", () => this.setPageSize(Number(select.value))), applyStyle(select, this.options.style?.pageSizeSelect), label.appendChild(select), nav.appendChild(label);
    }
    return nav;
  }
  paginationButton(label, page, disabled) {
    let button = document.createElement("button");
    return button.type = "button", button.className = "facet-table-pagination-button", button.textContent = label, button.disabled = disabled, button.style.padding = "4px 8px", button.style.border = "1px solid var(--facet-table-border-color, #e5e7eb)", button.style.borderRadius = "4px", button.style.background = "var(--facet-table-page-background, transparent)", button.style.color = "inherit", button.style.cursor = disabled ? "default" : "pointer", applyStyle(button, this.options.style?.paginationButton), button.addEventListener("click", () => this.setPage(page)), button;
  }
  pageRangeText() {
    let rowCount = this.filteredRows().length;
    if (!rowCount) return "0";
    let start = (this.currentPage - 1) * this.currentPageSize + 1, end = Math.min(rowCount, start + this.currentPageSize - 1);
    return `${start}\u2013${end} / ${rowCount}`;
  }
  renderValue(cell, column, value, row, rowIndex, descriptor) {
    let formatted = value == null && !column.formatter ? this.options.appearance?.rowsAndColumns?.displayEmptyCellAs ?? "" : column.formatter ? column.formatter(value, row, rowIndex) : column.format ? formatString(column.format, {
      value,
      row,
      rowIndex,
      column
    }) : String(value), prefix = descriptor?.prefix == null ? "" : String(descriptor.prefix), suffix = descriptor?.suffix == null ? "" : String(descriptor.suffix);
    typeof formatted == "string" ? cell.textContent = `${prefix}${formatted}${suffix}` : (prefix && cell.append(prefix), cell.appendChild(formatted), suffix && cell.append(suffix));
  }
  styleCell(cell, column, heading, value, columnIndex = 0) {
    cell.style.padding = densityPadding(
      this.options.layout?.rowDensity,
      !!column.chart,
      this.container.clientWidth
    ), this.styleBorders(cell, columnIndex), cell.style.textAlign = this.baseCellHorizontalAlignment(column, heading, value), cell.style.verticalAlign = "middle";
    let wrapText = this.options.layout?.wrapText;
    if (wrapText !== void 0 && (cell.style.whiteSpace = wrapText ? "normal" : "nowrap", wrapText && (cell.style.overflowWrap = "anywhere")), heading) {
      let header = this.options.appearance?.headerRow;
      cell.style.fontWeight = header?.bold === !1 ? "400" : header?.bold ? "700" : "600", cell.style.fontStyle = header?.italic ? "italic" : "normal", cell.style.background = header?.fillColor ?? "var(--facet-table-header-background, #f7f8fa)", header?.textColor && (cell.style.color = header.textColor), header?.textSize !== void 0 && (cell.style.fontSize = cssLength(header.textSize)), this.options.layout?.freezeHeaderRow && (cell.style.position = "sticky", cell.style.top = "0", cell.style.zIndex = "3");
    }
    this.options.layout?.freezeFirstColumn && columnIndex === 0 && (cell.style.position = "sticky", cell.style.left = "0", cell.style.zIndex = heading ? "4" : "2", !heading && !cell.style.backgroundColor && (cell.style.backgroundColor = this.options.appearance?.rowsAndColumns?.rowFill ?? "#fff")), heading && applyStyle(cell, this.options.style?.headerCell);
  }
  applyColumnStyle(cell, column, heading, value, row, rowIndex = 0) {
    let explicitAlignment = column.horizontalAlign ?? column.align;
    explicitAlignment ? cell.style.textAlign = explicitAlignment : column.role && (cell.style.textAlign = this.cellHorizontalAlignment(column, heading, value)), column.verticalAlign && (cell.style.verticalAlign = column.verticalAlign), column.width !== void 0 && (cell.style.width = typeof column.width == "number" ? `${column.width}px` : column.width), applyStyle(
      cell,
      heading ? column.headerStyle : resolveColumnStyle(column.style, value, row, rowIndex)
    );
  }
  baseCellHorizontalAlignment(column, heading, value) {
    if (heading)
      return this.options.appearance?.headerRow?.alignment ?? (column.chart ? "center" : "left");
    let role = column.role ?? (column.chart || typeof value == "number" ? "value" : "dimension"), rowsAndColumns = this.options.appearance?.rowsAndColumns;
    return rowsAndColumns ? role === "value" ? rowsAndColumns.valueAlignment ?? (column.chart ? "center" : "left") : rowsAndColumns.dimensionAlignment ?? "left" : column.chart ? "center" : "left";
  }
  cellHorizontalAlignment(column, heading, value) {
    let explicit = column.horizontalAlign ?? column.align;
    if (explicit) return explicit;
    if (heading)
      return this.options.appearance?.headerRow?.alignment ?? (column.chart ? "center" : "left");
    let role = column.role ?? (column.chart || typeof value == "number" ? "value" : "dimension"), rowsAndColumns = this.options.appearance?.rowsAndColumns;
    return rowsAndColumns ? role === "value" ? rowsAndColumns?.valueAlignment ?? (column.chart ? "center" : "left") : rowsAndColumns?.dimensionAlignment ?? "left" : column.chart ? "center" : "left";
  }
  styleBorders(cell, columnIndex) {
    let borders = this.options.appearance?.borders, color = borders?.borderColor ?? "var(--facet-table-border-color, #e5e7eb)", width = cssLength(borders?.borderWidth ?? 1);
    cell.style.borderBottom = borders?.horizontalBorders === !1 ? "none" : `${width} solid ${color}`, cell.style.borderRight = borders?.verticalBorders && columnIndex < this.options.columns.length - 1 ? `${width} solid ${color}` : "none";
  }
  customizedRowBackground(visibleRowIndex) {
    let options = this.options.appearance?.rowsAndColumns;
    return options?.bandedRows && visibleRowIndex % 2 === 1 ? options.bandedRowsAlternateColor ?? "#f8fafc" : options?.rowFill;
  }
  styleBodyCell(cell, columnIndex, rowBackground) {
    let options = this.options.appearance?.rowsAndColumns;
    options?.textColor && (cell.style.color = options.textColor), options?.bandedColumns && columnIndex % 2 === 1 ? cell.style.backgroundColor = options.bandedColumnsAlternateColor ?? "#f1f5f9" : this.options.layout?.freezeFirstColumn && columnIndex === 0 && (cell.style.backgroundColor = rowBackground || options?.rowFill || "#fff"), (options?.emphasizeFirstColumn && columnIndex === 0 || options?.emphasizeLastColumn && columnIndex === this.options.columns.length - 1) && (cell.style.fontWeight = "700");
  }
  bindRowHover(row) {
    let options = this.options.appearance?.rowsAndColumns;
    if (!options?.highlightRowOnHover) return;
    let cells = [...row.cells], backgrounds = [];
    row.addEventListener("mouseenter", () => {
      backgrounds = cells.map((cell) => ({
        value: cell.style.getPropertyValue("background-color"),
        priority: cell.style.getPropertyPriority("background-color")
      })), cells.forEach(
        (cell) => cell.style.setProperty(
          "background-color",
          options.hoverColor ?? "#eef2ff",
          "important"
        )
      );
    }), row.addEventListener("mouseleave", () => {
      cells.forEach((cell, index) => {
        let previous = backgrounds[index];
        previous?.value ? cell.style.setProperty("background-color", previous.value, previous.priority) : cell.style.removeProperty("background-color");
      });
    });
  }
  applyResponsiveDensity() {
    this.options.layout?.rowDensity !== "responsive" || !this.root || this.root.querySelectorAll("th, td").forEach((cell) => {
      cell.style.padding = densityPadding(
        "responsive",
        cell.classList.contains("facet-table-chart-cell") || cell.classList.contains("facet-table-chart-heading"),
        this.container.clientWidth
      );
    });
  }
  cellSeries(column, value, row, rowIndex) {
    if (column.chart?.series === "value") {
      if (!Array.isArray(value))
        throw new TypeError(
          `FacetTable: chart column "${column.key}" uses series: "value" but its cell value is not an array.`
        );
      return value;
    }
    if (typeof column.chart?.series == "function")
      return column.chart.series(value, row, rowIndex);
    let data = Array.isArray(value) ? value : value == null ? [] : [value];
    return [{ name: column.header ?? column.key, data }];
  }
  sharedDomains() {
    let domains = /* @__PURE__ */ new Map();
    for (let [columnIndex, column] of this.options.columns.entries()) {
      if (column.chart?.scale !== "shared") continue;
      let columnValues = [];
      if (this.filteredRows().forEach(({ row, rowIndex }) => {
        this.cellSeries(column, unwrapCellValue(row[column.key]), row, rowIndex).forEach(
          (series) => series.data.forEach((point) => columnValues.push(...pointValues(point)))
        );
      }), !columnValues.length) continue;
      let type = column.chart.type ?? column.chart.options?.chart?.type ?? "sparkline";
      domains.set(columnIndex, paddedDomain(columnValues, type));
    }
    return domains;
  }
  mountChart(item, domain) {
    let cell = item.column.chart, type = cell.type ?? cell.options?.chart?.type ?? "sparkline", height = cell.height ?? cell.options?.chart?.height ?? 44, options = merge(
      {
        chart: {
          type,
          height,
          animation: !1,
          backgroundColor: "transparent",
          spacing: [2, 2, 2, 2],
          responsive: !1,
          scaleFonts: !1,
          reflow: !1
        },
        xAxis: { visible: !1 },
        yAxis: { visible: !1 },
        legend: { enabled: !1 },
        series: item.series
      },
      cell.options,
      { series: item.series }
    );
    if (options.chart = { ...options.chart, type, height }, domain && (options = withSharedDomain(options, domain)), !options.accessibility?.description) {
      let rowName = this.rowName(item.row, item.rowIndex);
      options.accessibility = {
        ...options.accessibility,
        description: `${item.column.header ?? item.column.key} for ${rowName}`
      };
    }
    return new FacetViz(item.host, options);
  }
  rowName(row, rowIndex) {
    let labelColumn = this.options.columns.find((column) => !column.chart);
    if (!labelColumn) return `row ${rowIndex + 1}`;
    let value = unwrapCellValue(row[labelColumn.key]);
    return value == null || value === "" ? `row ${rowIndex + 1}` : String(value);
  }
  destroyCharts() {
    this.charts.forEach((chart) => chart.destroy()), this.charts.length = 0;
  }
  paginationOptions() {
    let pagination = this.options.pagination;
    if (pagination)
      return pagination === !0 ? {} : pagination.enabled === !1 ? void 0 : pagination;
  }
  syncPagination(pagination, initial) {
    let options = !pagination || typeof pagination == "object" && pagination.enabled === !1 ? void 0 : pagination === !0 ? {} : pagination;
    if (!options) {
      this.currentPage = 1, initial && (this.currentPageSize = 25);
      return;
    }
    (initial || options.pageSize !== void 0) && (this.currentPageSize = positiveInteger(
      options.pageSize ?? 25,
      "FacetTable pagination.pageSize"
    )), (initial || options.page !== void 0) && (this.currentPage = positiveInteger(
      options.page ?? 1,
      "FacetTable pagination.page"
    ));
  }
  clampPage() {
    if (!this.paginationOptions()) {
      this.currentPage = 1;
      return;
    }
    this.currentPage = Math.min(Math.max(1, this.currentPage), this.pageCount);
  }
  /** One observer per table is cheaper than one observer per chart cell. */
  setupReflow() {
    typeof ResizeObserver > "u" || (this.resizeObserver = new ResizeObserver(() => {
      if (this.applyResponsiveDensity(), typeof requestAnimationFrame > "u") {
        this.reflow();
        return;
      }
      this.resizeFrame !== void 0 && cancelAnimationFrame(this.resizeFrame), this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = void 0, this.reflow();
      });
    }), this.resizeObserver.observe(this.container));
  }
}, UNITLESS_STYLE_PROPERTIES = /* @__PURE__ */ new Set([
  "animationIterationCount",
  "flexGrow",
  "flexShrink",
  "fontWeight",
  "lineHeight",
  "opacity",
  "order",
  "zIndex"
]), filterIdCounter = 0;
function cssLength(value) {
  return typeof value == "number" ? `${value}px` : value;
}
function densityPadding(density, chartCell, containerWidth = 0) {
  return density === "responsive" ? containerWidth >= 900 ? chartCell ? "6px 12px" : "10px 12px" : containerWidth >= 600 ? chartCell ? "3px 8px" : "6px 8px" : chartCell ? "2px 6px" : "4px 6px" : density === "compact" ? chartCell ? "2px 6px" : "4px 6px" : density === "cozy" || density === "crazy" ? chartCell ? "3px 8px" : "6px 8px" : density === "comfortable" ? chartCell ? "6px 12px" : "10px 12px" : chartCell ? "4px 10px" : "8px 10px";
}
function applyStyle(element, style) {
  if (style)
    for (let [property, rawValue] of Object.entries(style)) {
      let customProperty = property.startsWith("--"), value = typeof rawValue == "number" && !customProperty && !UNITLESS_STYLE_PROPERTIES.has(property) ? `${rawValue}px` : String(rawValue);
      customProperty || property.includes("-") ? element.style.setProperty(property, value) : element.style[property] = value;
    }
}
function resolveCellDescriptor(value) {
  if (!value || typeof value != "object" || Array.isArray(value) || value instanceof Date || !Object.prototype.hasOwnProperty.call(value, "value")) return;
  let candidate = value;
  return Object.keys(candidate).some(
    (property) => property === "prefix" || property === "suffix" || property === "style" || isDirectCellStyleProperty(property)
  ) ? candidate : void 0;
}
function unwrapCellValue(value) {
  let descriptor = resolveCellDescriptor(value);
  return descriptor ? descriptor.value : value;
}
function descriptorStyle(descriptor) {
  if (!descriptor) return;
  let style = { ...descriptor.style ?? {} };
  for (let [property, value] of Object.entries(descriptor))
    property === "value" || property === "prefix" || property === "suffix" || property === "style" || !isDirectCellStyleProperty(property) || typeof value != "string" && typeof value != "number" || (style[property] = value);
  return Object.keys(style).length ? style : void 0;
}
function isDirectCellStyleProperty(property) {
  return property.startsWith("--") || property.includes("-") || property in document.documentElement.style;
}
function createSortIndicator(direction) {
  let namespace = "http://www.w3.org/2000/svg", indicator = document.createElementNS(namespace, "svg");
  indicator.setAttribute("viewBox", "0 0 14 14"), indicator.setAttribute("width", "16"), indicator.setAttribute("height", "16"), indicator.setAttribute("fill", "currentColor"), indicator.setAttribute("stroke", "currentColor"), indicator.setAttribute("stroke-width", "1.8"), indicator.setAttribute("stroke-linecap", "round"), indicator.setAttribute("stroke-linejoin", "round"), indicator.setAttribute("aria-hidden", "true"), indicator.setAttribute("focusable", "false"), indicator.dataset.direction = direction ?? "none", indicator.style.display = "block", indicator.style.width = "16px", indicator.style.height = "16px", indicator.style.flex = "0 0 16px";
  let paths = direction === "asc" ? ["M4 10l4-4 4 4z"] : direction === "desc" ? ["M4 6l4 4 4-4z"] : ["M4 6l4-3 4 3z", "M4 10l4 3 4-3z"];
  for (let pathData of paths) {
    let path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData), indicator.appendChild(path);
  }
  return indicator;
}
function createFilterIndicator() {
  let namespace = "http://www.w3.org/2000/svg", indicator = document.createElementNS(namespace, "svg");
  indicator.setAttribute("viewBox", "0 0 16 16"), indicator.setAttribute("width", "16"), indicator.setAttribute("height", "16"), indicator.setAttribute("fill", "currentColor"), indicator.setAttribute("aria-hidden", "true"), indicator.setAttribute("focusable", "false"), indicator.style.display = "block", indicator.style.width = "16px", indicator.style.height = "16px", indicator.style.flex = "0 0 16px";
  let path = document.createElementNS(namespace, "path");
  return path.setAttribute("d", "M2 3h12L9.5 8.2v3.6L6.5 13V8.2L2 3z"), indicator.appendChild(path), indicator;
}
function filterActionButton(label, style) {
  let button = document.createElement("button");
  return button.type = "button", button.className = "facet-table-filter-action", button.textContent = label, button.style.padding = "4px 8px", button.style.border = "1px solid var(--facet-table-border-color, #d1d5db)", button.style.borderRadius = "4px", button.style.background = "transparent", button.style.color = "inherit", button.style.font = "inherit", button.style.cursor = "pointer", applyStyle(button, style), button;
}
function resolveRowStyle(style, row, rowIndex) {
  return typeof style == "function" ? style(row, rowIndex) : style;
}
function resolveColumnStyle(style, value, row, rowIndex) {
  return typeof style == "function" ? style(value, row, rowIndex) : style;
}
function resolveCellStyle(style, value, row, rowIndex, column) {
  return typeof style == "function" ? style(value, row, rowIndex, column) : style;
}
function paginationLabels(labels) {
  return {
    first: labels?.first ?? "First",
    previous: labels?.previous ?? "Previous",
    next: labels?.next ?? "Next",
    last: labels?.last ?? "Last",
    page: labels?.page ?? "Page",
    of: labels?.of ?? "of",
    rows: labels?.rows ?? "rows",
    perPage: labels?.perPage ?? "Rows per page"
  };
}
function paginationAlignment(align) {
  return align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
}
function sortAlignment(align) {
  return align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
}
function initialSort(columns) {
  let column = columns.find(
    (candidate) => typeof candidate.sortable == "object" && candidate.sortable.initialDirection
  );
  if (!(!column || typeof column.sortable != "object" || !column.sortable.initialDirection))
    return { key: column.key, direction: column.sortable.initialDirection };
}
function initialFilters(columns) {
  let filters = /* @__PURE__ */ new Map();
  for (let column of columns) {
    if (typeof column.filterable != "object") continue;
    let value = column.filterable.initialValue?.trim();
    value && filters.set(column.key, value);
  }
  return filters;
}
function reconcileFilters(current, columns) {
  let filters = initialFilters(columns);
  for (let [key, value] of current)
    columns.some((column) => column.key === key && column.filterable) && filters.set(key, value);
  return filters;
}
function tableRowType(row) {
  let value = row.rowType;
  return value === "detail" || value === "subtotal" || value === "grandTotal" ? value : void 0;
}
function tableRowGroupPath(row) {
  let value = row.groupPath;
  return Array.isArray(value) ? value : [];
}
function isStructuredTableRow(row) {
  return tableRowType(row) !== void 0 || tableRowGroupPath(row).length > 0;
}
function sortDetailRowsWithinGroups(rows, compare) {
  let result2 = [...rows], groups = /* @__PURE__ */ new Map();
  return rows.forEach((entry, position) => {
    let rowType = tableRowType(entry.row);
    if (rowType === "subtotal" || rowType === "grandTotal") return;
    let signature = groupPathSignature(tableRowGroupPath(entry.row)), group = groups.get(signature) ?? { positions: [], rows: [] };
    group.positions.push(position), group.rows.push(entry), groups.set(signature, group);
  }), groups.forEach((group) => {
    group.rows.sort(compare), group.positions.forEach((position, index) => {
      result2[position] = group.rows[index];
    });
  }), result2;
}
function groupPathSignature(groupPath) {
  return groupPath.map(groupPathValueSignature).join("");
}
function groupPathValueSignature(value) {
  if (value instanceof Date) return "date:" + value.toISOString();
  if (value && typeof value == "object")
    try {
      return "object:" + JSON.stringify(value);
    } catch {
      return "object:" + String(value);
    }
  return typeof value + ":" + String(value);
}
function compareNullsLast(a, b) {
  let aNull = a == null, bNull = b == null;
  if (!(!aNull && !bNull))
    return aNull && bNull ? 0 : aNull ? 1 : -1;
}
function compareTableValues(a, b) {
  return typeof a == "number" && typeof b == "number" ? a - b : a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : typeof a == "boolean" && typeof b == "boolean" ? Number(a) - Number(b) : String(a).localeCompare(String(b), void 0, {
    numeric: !0,
    sensitivity: "base"
  });
}
function pageSizeChoices(options, current) {
  let valid = (options.pageSizeOptions ?? [10, 25, 50, 100]).filter(
    (value) => Number.isSafeInteger(value) && value > 0
  );
  return [.../* @__PURE__ */ new Set([...valid, current])].sort((a, b) => a - b);
}
function visiblePageNumbers(current, count, requestedMaximum) {
  let maximum = Math.max(1, Math.floor(requestedMaximum) || 1), visible = Math.min(count, maximum), start = Math.min(
    Math.max(1, current - Math.floor(visible / 2)),
    Math.max(1, count - visible + 1)
  );
  return Array.from({ length: visible }, (_, index) => start + index);
}
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive integer.`);
  return value;
}
function clampInteger(value, min, max, label) {
  let integer = positiveInteger(value, label);
  return Math.min(max, Math.max(min, integer));
}
function pointValues(point) {
  return typeof point == "number" ? Number.isFinite(point) ? [point] : [] : Array.isArray(point) ? point.slice(1).filter(
    (value) => typeof value == "number" && Number.isFinite(value)
  ) : !point || typeof point != "object" ? [] : [point.y, point.low, point.high, point.value].filter(
    (value) => typeof value == "number" && Number.isFinite(value)
  );
}
function paddedDomain(values, type) {
  let min = Math.min(...values), max = Math.max(...values), zeroBased = type === "bar" || type === "column" || type === "lollipop";
  if (zeroBased && (min = Math.min(0, min), max = Math.max(0, max)), min === max) {
    let padding2 = Math.abs(min) * 0.05 || 1;
    return zeroBased && min >= 0 ? [0, max + padding2] : [min - padding2, max + padding2];
  }
  let padding = (max - min) * 0.05;
  return [zeroBased && min === 0 ? 0 : min - padding, zeroBased && max === 0 ? 0 : max + padding];
}
function withSharedDomain(options, [min, max]) {
  if (Array.isArray(options.yAxis)) {
    let axes = options.yAxis.length ? [...options.yAxis] : [{}];
    return axes[0] = { ...axes[0], min: axes[0].min ?? min, max: axes[0].max ?? max }, { ...options, yAxis: axes };
  }
  return {
    ...options,
    yAxis: {
      ...options.yAxis,
      min: options.yAxis?.min ?? min,
      max: options.yAxis?.max ?? max
    }
  };
}
export {
  BaseSeries,
  CategoryScale,
  FacetViz as Chart,
  FacetTable as ChartTable,
  ChartValidationError,
  DEFAULT_COLORS,
  FacetTable,
  FacetViz,
  LIGHT_THEME,
  LinearScale,
  LogScale,
  Renderer,
  abbreviateNumber,
  computeBoxStats,
  createSeries,
  formatDate,
  formatNumber,
  formatString,
  formatValue,
  groupThousands,
  isSeriesTypeRegistered,
  registerAllSeries,
  registerSeriesType,
  registerSeriesTypes,
  registerTheme,
  resolveTheme,
  validateChartOptions
};
