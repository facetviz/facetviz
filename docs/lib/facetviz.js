// src/core/renderer.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var Renderer = class {
  constructor(width, height) {
    this.root = document.createElementNS(SVG_NS, "svg");
    this.root.setAttribute("xmlns", SVG_NS);
    this.setSize(width, height);
    this.root.setAttribute("class", "facet-root");
    this.root.style.maxWidth = "100%";
    this.root.style.height = "auto";
    this.root.style.display = "block";
  }
  setSize(width, height) {
    this.root.setAttribute("width", String(width));
    this.root.setAttribute("height", String(height));
    this.root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  /** Create an SVG element with attributes, optionally appending to a parent. */
  create(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    this.attr(el, attrs);
    if (parent) parent.appendChild(el);
    return el;
  }
  /** A grouping <g>, the usual container for a logical chart part. */
  group(attrs = {}, parent) {
    return this.create("g", attrs, parent ?? this.root);
  }
  attr(el, attrs) {
    for (const key in attrs) {
      const value = attrs[key];
      if (value === void 0 || value === null) continue;
      el.setAttribute(key, String(value));
    }
  }
  /** Positioned, styleable text. Returns the element so callers can measure it. */
  text(content, x, y, attrs = {}, parent) {
    const el = this.create("text", { x, y, ...attrs }, parent ?? this.root);
    el.textContent = content;
    return el;
  }
  /** Build an SVG path `d` string from segment tokens. */
  static path(segments) {
    return segments.map((s) => s.join(" ")).join(" ");
  }
  clear() {
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
  }
  mount(container) {
    container.appendChild(this.root);
  }
};

// src/core/utils.ts
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function merge(target, ...sources) {
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = out[key];
      if (isObject(sv) && isObject(tv)) {
        out[key] = merge(tv, sv);
      } else if (sv !== void 0) {
        out[key] = sv;
      }
    }
  }
  return out;
}
function sum(values) {
  let total = 0;
  for (const v of values) if (typeof v === "number" && !Number.isNaN(v)) total += v;
  return total;
}
function extent(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return [0, 1];
  return [min, max];
}
function decimateLine(pts, targetPerColumn = 1) {
  if (pts.length < 400) return pts;
  const out = [];
  let colX = Math.round(pts[0].x / targetPerColumn);
  let first = null, last = null, min = null, max = null;
  const flush = () => {
    if (!first) return;
    const chosen = [first, min, max, last].filter((p, i, a) => a.indexOf(p) === i).sort((a, b) => a.x - b.x);
    out.push(...chosen);
  };
  for (const p of pts) {
    const cx = Math.round(p.x / targetPerColumn);
    if (cx !== colX) {
      flush();
      colX = cx;
      first = min = max = last = null;
    }
    if (!first) first = p;
    if (!min || p.y < min.y) min = p;
    if (!max || p.y > max.y) max = p;
    last = p;
  }
  flush();
  return out;
}
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = s * 16807 % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function formatString(template, ctx) {
  return template.replace(/\{([^{}:]+)(?::([^{}]*))?\}/g, (_, path, spec) => {
    const value = resolvePath(ctx, path.trim());
    if (value === void 0 || value === null) return "";
    if (spec !== void 0 && spec !== "") {
      if (/%[a-zA-Z]/.test(spec)) return formatDate(value, spec);
      if (typeof value === "number") return formatValue(value, spec);
    }
    return String(value);
  });
}
function resolvePath(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object") return acc[key];
    return void 0;
  }, obj);
}
function groupThousands(numStr, sep = ",") {
  const neg = numStr.startsWith("-");
  const body = neg ? numStr.slice(1) : numStr;
  const [int, frac] = body.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? "-" : "") + grouped + (frac !== void 0 ? "." + frac : "");
}
function abbreviateNumber(value, decimals = 1) {
  const units = [
    { v: 1e12, s: "T" },
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "k" }
  ];
  const abs = Math.abs(value);
  for (const u of units) {
    if (abs >= u.v) return (value / u.v).toFixed(decimals).replace(/\.0+$/, "") + u.s;
  }
  return trimZeros(value.toFixed(decimals));
}
function trimZeros(s) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
function formatValue(value, spec) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const m = /^([^,.\d%sfed]*)(,)?(?:\.(\d+))?([sfed%])?(.*)$/.exec(spec);
  if (!m) return String(value);
  const [, prefix = "", comma, decStr, type, suffix = ""] = m;
  const decimals = decStr !== void 0 ? parseInt(decStr, 10) : void 0;
  let out;
  let unit = "";
  switch (type) {
    case "%":
      out = (value * 100).toFixed(decimals ?? 0);
      unit = "%";
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
  if (comma && type !== "s") out = groupThousands(out);
  return `${prefix}${out}${unit}${suffix}`;
}
function formatNumber(value, opts = {}) {
  if (value === void 0 || value === null || Number.isNaN(value)) return "";
  let n = opts.decimals !== void 0 ? value.toFixed(opts.decimals) : String(value);
  if (opts.thousands) n = groupThousands(n);
  return `${opts.prefix ?? ""}${n}${opts.suffix ?? ""}`;
}
var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatDate(value, pattern) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p2 = (n) => String(n).padStart(2, "0");
  const map = {
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
  const span = max - min || 1;
  const SEC = 1e3, MIN = 60 * SEC, HOUR = 60 * MIN, DAY2 = 24 * HOUR, YEAR = 365 * DAY2;
  let step, format, floor, next;
  if (span > 2 * YEAR) {
    format = "%Y";
    floor = (t) => new Date(new Date(t).getFullYear(), 0, 1).getTime();
    const yStep = Math.max(1, Math.ceil(span / YEAR / count));
    next = (t) => {
      const d = new Date(t);
      return new Date(d.getFullYear() + yStep, 0, 1).getTime();
    };
    step = 0;
  } else if (span > 60 * DAY2) {
    format = "%b %Y";
    floor = (t) => {
      const d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    };
    const mStep = Math.max(1, Math.ceil(span / (30 * DAY2) / count));
    next = (t) => {
      const d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth() + mStep, 1).getTime();
    };
    step = 0;
  } else if (span > 2 * DAY2) {
    format = "%b %d";
    step = niceUnit(span / count, [DAY2, 2 * DAY2, 7 * DAY2, 14 * DAY2]);
    floor = (t) => Math.floor(t / DAY2) * DAY2;
    next = (t) => t + step;
  } else if (span > 2 * HOUR) {
    format = "%H:%M";
    step = niceUnit(span / count, [HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR]);
    floor = (t) => Math.floor(t / HOUR) * HOUR;
    next = (t) => t + step;
  } else {
    format = "%H:%M";
    step = niceUnit(span / count, [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN]);
    floor = (t) => Math.floor(t / MIN) * MIN;
    next = (t) => t + step;
  }
  const ticks = [];
  for (let t = floor(min); t <= max && ticks.length < 100; t = next(t)) {
    if (t >= min) ticks.push(t);
  }
  if (!ticks.length) ticks.push(min, max);
  return { ticks, format };
}
function niceUnit(target, choices) {
  return choices.find((c) => c >= target) ?? choices[choices.length - 1];
}
function niceTicks(min, max, count = 6) {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const span = niceNum(max - min, false);
  const step = niceNum(span / Math.max(1, count - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}
function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range || 1));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

// src/core/scale.ts
var LinearScale = class {
  constructor(cfg) {
    [this.d0, this.d1] = cfg.domain;
    [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range;
    this.format = cfg.format;
    this.tickValues = cfg.ticks ?? niceTicks(this.d0, this.d1, cfg.tickCount ?? 6);
    if (this.tickValues.length) {
      this.d0 = Math.min(this.d0, this.tickValues[0]);
      this.d1 = Math.max(this.d1, this.tickValues[this.tickValues.length - 1]);
    }
  }
  scale(value) {
    const v = typeof value === "number" ? value : parseFloat(value);
    const t = this.d1 === this.d0 ? 0 : (v - this.d0) / (this.d1 - this.d0);
    return this.r0 + t * (this.r1 - this.r0);
  }
  invert(pixel) {
    const t = this.r1 === this.r0 ? 0 : (pixel - this.r0) / (this.r1 - this.r0);
    return this.d0 + t * (this.d1 - this.d0);
  }
  ticks() {
    return this.tickValues;
  }
  tickLabel(value) {
    const v = typeof value === "number" ? value : parseFloat(value);
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
};
var LogScale = class {
  constructor(cfg) {
    const lo = Math.max(cfg.domain[0], 1e-9);
    const hi = Math.max(cfg.domain[1], lo * 10);
    this.l0 = Math.log10(lo);
    this.l1 = Math.log10(hi);
    [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range;
    this.format = cfg.format;
  }
  scale(value) {
    const v = Math.max(typeof value === "number" ? value : parseFloat(value), 1e-9);
    const t = (Math.log10(v) - this.l0) / (this.l1 - this.l0);
    return this.r0 + t * (this.r1 - this.r0);
  }
  ticks() {
    const ticks = [];
    for (let e = Math.floor(this.l0); e <= Math.ceil(this.l1); e++) {
      ticks.push(Math.pow(10, e));
    }
    return ticks;
  }
  tickLabel(value) {
    const v = typeof value === "number" ? value : parseFloat(value);
    return this.format ? this.format(v) : String(v);
  }
  bandwidth() {
    return 0;
  }
  range() {
    return [this.r0, this.r1];
  }
};
var CategoryScale = class {
  constructor(cfg) {
    this.index = /* @__PURE__ */ new Map();
    this.categories = cfg.reversed ? [...cfg.categories].reverse() : cfg.categories;
    this.categories.forEach((c, i) => this.index.set(String(c), i));
    [this.r0, this.r1] = cfg.range;
    this.pad = cfg.padding ?? 0.2;
    this.step = (this.r1 - this.r0) / Math.max(1, this.categories.length);
    this.format = cfg.format;
  }
  /** Returns the centre pixel of a category's band. */
  scale(value) {
    const i = this.index.get(String(value));
    const idx = i === void 0 ? Number(value) : i;
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

// src/core/defaults.ts
var DEFAULT_OPTIONS = {
  chart: {
    type: "line",
    height: 400,
    spacing: [16, 16, 16, 16],
    inverted: false,
    polar: false
    // `backgroundColor`, `colors`, and `width` are intentionally left unset so
    // the theme (and container width) can supply them; explicit user values
    // still win via the normal merge.
  },
  title: { text: void 0, align: "center" },
  subtitle: { text: void 0, align: "center" },
  tooltip: {
    enabled: true,
    shared: false
    // Colours come from the theme unless the user overrides them.
  },
  legend: {
    enabled: true,
    align: "center",
    verticalAlign: "bottom"
  }
};
var LAYOUT = {
  titleHeight: 30,
  subtitleHeight: 20,
  legendHeight: 34,
  axisLabelGap: 8,
  axisTitleGap: 28,
  tickLength: 5,
  defaultLeftAxisWidth: 44,
  defaultBottomAxisHeight: 34
};
var FONTS = {
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
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function shade(hex, amount) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const adjust = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const [r, g, b] = rgb.map(adjust);
  return `rgb(${r}, ${g}, ${b})`;
}
function alpha(hex, a) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}
function lerpColor(from, to, t) {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const k = Math.max(0, Math.min(1, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// src/core/theme.ts
var FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
var LIGHT_THEME = {
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
};
var DARK_THEME = {
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
};
var HIGH_CONTRAST_THEME = {
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
};
var PASTEL_THEME = {
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
};
var THEMES = {
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
  if (typeof input === "string") return THEMES[input] ?? LIGHT_THEME;
  const base = THEMES[input.base ?? "light"] ?? LIGHT_THEME;
  return merge(base, input);
}
var THEME = { ...LIGHT_THEME };
function applyTheme(theme) {
  Object.assign(THEME, theme);
  const ff = theme.fontFamily;
  FONTS.title = { "font-size": theme.title.fontSize, "font-weight": theme.title.fontWeight, fill: theme.title.color, "font-family": ff };
  FONTS.subtitle = { "font-size": theme.subtitle.fontSize, fill: theme.subtitle.color, "font-family": ff };
  FONTS.axisLabel = { "font-size": "11px", fill: theme.axis.labelColor, "font-family": ff };
  FONTS.axisTitle = { "font-size": "12px", fill: theme.axis.titleColor, "font-family": ff };
  FONTS.legend = { "font-size": "12px", fill: theme.legend.color, "font-family": ff };
  FONTS.dataLabel = { "font-size": "11px", fill: theme.dataLabel.color, "font-family": ff };
}

// src/core/axis.ts
var Axis = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  get horizontal() {
    return this.cfg.position === "bottom" || this.cfg.position === "top";
  }
  render(parent) {
    const { renderer, scale, options, position } = this.cfg;
    if (options.visible === false) return;
    const group = renderer.group({ class: `facet-axis facet-axis-${position}` }, parent);
    const ticks = scale.ticks();
    const isCategory = scale instanceof CategoryScale;
    this.drawPlotBands(group);
    const axisColor = options.lineColor ?? THEME.axis.lineColor;
    if (options.lineWidth !== 0) {
      const line = this.axisLineCoords();
      renderer.create("line", {
        ...line,
        stroke: axisColor,
        "stroke-width": options.lineWidth ?? 1
      }, group);
    }
    const labelsEnabled = options.labels?.enabled !== false;
    const gridColor = options.gridLineColor ?? THEME.axis.gridLineColor;
    const gridWidth = options.gridLineWidth ?? (this.horizontal ? 0 : 1);
    for (const tick of ticks) {
      const pos = scale.scale(tick);
      if (this.cfg.grid && gridWidth > 0 && !isCategory) {
        this.drawGridLine(group, pos, gridColor, gridWidth);
      }
      if (options.ticks !== false) this.drawTick(group, pos, axisColor);
      if (labelsEnabled) {
        this.drawLabel(group, pos, this.labelText(scale, tick), options);
      }
    }
    this.drawPlotLines(group);
    if (options.title?.text) this.drawTitle(group, options.title.text);
  }
  /** Shaded bands spanning an axis interval (horizontal or vertical). */
  drawPlotBands(g) {
    const { renderer, scale, plot } = this.cfg;
    for (const band of this.cfg.options.plotBands ?? []) {
      const p0 = scale.scale(band.from);
      const p1 = scale.scale(band.to);
      const rect = this.horizontal ? { x: Math.min(p0, p1), y: plot.y, width: Math.abs(p1 - p0), height: plot.height } : { x: plot.x, y: Math.min(p0, p1), width: plot.width, height: Math.abs(p1 - p0) };
      renderer.create("rect", { ...rect, fill: band.color ?? "rgba(70,130,180,0.12)", stroke: "none", class: "facet-plotband" }, g);
      if (band.label?.text) {
        renderer.text(band.label.text, rect.x + 4, rect.y + 12, {
          ...FONTS.axisLabel,
          fill: band.label.color ?? "#666",
          "text-anchor": "start"
        }, g);
      }
    }
  }
  /** Reference lines at fixed axis values (horizontal or vertical). */
  drawPlotLines(g) {
    const { renderer, scale, plot } = this.cfg;
    for (const line of this.cfg.options.plotLines ?? []) {
      const pos = scale.scale(line.value);
      const coords = this.horizontal ? { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height } : { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos };
      renderer.create("line", {
        ...coords,
        stroke: line.color ?? "#e63946",
        "stroke-width": line.width ?? 1.5,
        "stroke-dasharray": line.dashStyle ?? void 0,
        class: "facet-plotline"
      }, g);
      if (line.label?.text) {
        const lx = this.horizontal ? pos + 4 : plot.x + plot.width - 4;
        const ly = this.horizontal ? plot.y + 12 : pos - 4;
        renderer.text(line.label.text, lx, ly, {
          ...FONTS.axisLabel,
          fill: line.label.color ?? line.color ?? "#e63946",
          "text-anchor": this.horizontal ? "start" : "end"
        }, g);
      }
    }
  }
  labelText(scale, tick) {
    const opts = this.cfg.options.labels;
    if (opts?.formatter) return opts.formatter(tick);
    const base = scale.tickLabel(tick);
    if (opts?.format) return formatString(opts.format, { value: typeof tick === "number" ? tick : base });
    return base;
  }
  axisLineCoords() {
    const { plot, position } = this.cfg;
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
  drawGridLine(g, pos, color, width) {
    const { renderer, plot } = this.cfg;
    if (this.horizontal) {
      renderer.create("line", { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height, stroke: color, "stroke-width": width }, g);
    } else {
      renderer.create("line", { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos, stroke: color, "stroke-width": width }, g);
    }
  }
  drawTick(g, pos, color) {
    const { renderer, plot, position } = this.cfg;
    const len = LAYOUT.tickLength;
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
  drawLabel(g, pos, text, options) {
    const { renderer, plot, position } = this.cfg;
    const style = { ...FONTS.axisLabel, ...options.labels?.style ?? {} };
    const rotation = options.labels?.rotation ?? 0;
    let x = 0;
    let y = 0;
    let anchor = "middle";
    let baseline = "middle";
    switch (position) {
      case "bottom":
        x = pos;
        y = plot.y + plot.height + LAYOUT.tickLength + (rotation ? 8 : 7);
        baseline = rotation ? "middle" : "hanging";
        anchor = rotation ? rotation < 0 ? "end" : "start" : "middle";
        break;
      case "top":
        x = pos;
        y = plot.y - LAYOUT.tickLength - (rotation ? 8 : 6);
        anchor = rotation ? rotation < 0 ? "start" : "end" : "middle";
        break;
      case "left":
        x = plot.x - LAYOUT.tickLength - 4;
        y = pos;
        anchor = "end";
        break;
      case "right":
        x = plot.x + plot.width + LAYOUT.tickLength + 4;
        y = pos;
        anchor = "start";
        break;
    }
    const el = renderer.text(text, x, y, {
      "text-anchor": anchor,
      "dominant-baseline": baseline,
      ...style
    }, g);
    if (rotation) el.setAttribute("transform", `rotate(${rotation} ${x} ${y})`);
  }
  drawTitle(g, text) {
    const { renderer, plot, position } = this.cfg;
    const style = FONTS.axisTitle;
    const labelsEnabled = this.cfg.options.labels?.enabled !== false;
    const gap = labelsEnabled ? this.labelExtent() : 0;
    if (this.horizontal) {
      const x = plot.x + plot.width / 2;
      const y = position === "bottom" ? plot.y + plot.height + LAYOUT.tickLength + gap + 14 : plot.y - LAYOUT.tickLength - gap - 10;
      renderer.text(text, x, y, { "text-anchor": "middle", ...style }, g);
    } else {
      const x = position === "left" ? plot.x - LAYOUT.tickLength - 4 - gap - 8 : plot.x + plot.width + LAYOUT.tickLength + 4 + gap + 8;
      const y = plot.y + plot.height / 2;
      const rot = position === "left" ? -90 : 90;
      renderer.text(text, x, y, { "text-anchor": "middle", transform: `rotate(${rot} ${x} ${y})`, ...style }, g);
    }
  }
  /**
   * Estimated size of the tick labels along the axis-title direction: the
   * widest label (px) for vertical axes, or the label height for horizontal
   * axes. Used to offset the title clear of the labels.
   */
  labelExtent() {
    const { scale, options } = this.cfg;
    const fontPx = parseFloat(options.labels?.style?.["font-size"] ?? FONTS.axisLabel["font-size"] ?? "11") || 11;
    const charW = fontPx * 0.6;
    let maxW = 0;
    for (const t of scale.ticks()) {
      maxW = Math.max(maxW, this.labelText(scale, t).length * charW);
    }
    const rot = options.labels?.rotation ?? 0;
    if (this.horizontal) {
      return rot ? Math.abs(Math.sin(rot * Math.PI / 180)) * maxW + fontPx : fontPx + 2;
    }
    return maxW;
  }
};

// src/core/nested-axis.ts
var NestedAxis = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  render(parent) {
    const g = this.cfg.renderer.group(
      { class: "facet-axis facet-axis-nested" },
      parent
    );
    if (this.cfg.position === "split") this.renderSplit(g);
    else this.renderStacked(g, this.cfg.position === "top");
  }
  /** All tiers on one side (below or above the plot). */
  renderStacked(g, top) {
    const { renderer, scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? THEME.axis.lineColor;
    const levels = leaves[0]?.length ?? 0;
    const dir = top ? -1 : 1;
    const baseY = top ? plot.y : plot.y + plot.height;
    const rowH = 18;
    const leafCenter = (i) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;
    const bottomY = plot.y + plot.height;
    renderer.create(
      "line",
      {
        x1: plot.x,
        y1: baseY,
        x2: plot.x + plot.width,
        y2: baseY,
        stroke: color
      },
      g
    );
    for (let level = levels - 1; level >= 0; level--) {
      const row = levels - 1 - level;
      const rowStart = baseY + dir * (LAYOUT.tickLength + row * rowH);
      const segments = this.segmentsForLevel(leaves, level);
      const labelY = rowStart + dir * 12;
      for (const seg of segments) {
        const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        renderer.text(
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
      if (level < levels - 1) {
        const bandHalf2 = scale.fullStep() / 2;
        for (let s = 1; s < segments.length; s++) {
          const bx = leafCenter(segments[s].startLeaf) - bandHalf2;
          renderer.create(
            "line",
            {
              x1: bx,
              y1: baseY,
              x2: bx,
              y2: rowStart + dir * rowH,
              stroke: color,
              "stroke-width": 1
            },
            g
          );
        }
      }
    }
    const topExtent = plot.y;
    const outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      const bx = leafCenter(outer[s].startLeaf) - bandHalf;
      renderer.create(
        "line",
        {
          x1: bx,
          y1: topExtent,
          x2: bx,
          y2: bottomY + LAYOUT.tickLength + 20,
          stroke: color,
          "stroke-width": 1
        },
        g
      );
    }
  }
  /**
   * Split layout: innermost dimension as normal labels at the bottom, outer
   * grouping dimensions stacked on top, and full-height vertical lines
   * separating each top-level group.
   */
  renderSplit(g) {
    const { renderer, scale, plot, leaves, keys } = this.cfg;
    const color = this.cfg.lineColor ?? THEME.axis.lineColor;
    const levels = leaves[0]?.length ?? 0;
    const rowH = 18;
    const leafCenter = (i) => scale.scale(keys[i]);
    const bandHalf = scale.fullStep() / 2;
    const bottomY = plot.y + plot.height;
    renderer.create(
      "line",
      {
        x1: plot.x,
        y1: bottomY,
        x2: plot.x + plot.width,
        y2: bottomY,
        stroke: color
      },
      g
    );
    for (const seg of this.segmentsForLevel(leaves, levels - 1)) {
      const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
      renderer.text(
        seg.label,
        cx,
        bottomY + LAYOUT.tickLength + 12,
        {
          "text-anchor": "middle",
          ...FONTS.axisLabel
        },
        g
      );
    }
    for (let level = levels - 2; level >= 0; level--) {
      const rowFromTop = levels - 2 - level;
      const labelY = plot.y - LAYOUT.tickLength - rowFromTop * rowH - 4;
      for (const seg of this.segmentsForLevel(leaves, level)) {
        const cx = (leafCenter(seg.startLeaf) + leafCenter(seg.endLeaf)) / 2;
        renderer.text(
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
    const topExtent = plot.y - LAYOUT.tickLength - (levels - 1) * rowH;
    const outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      const bx = leafCenter(outer[s].startLeaf) - bandHalf;
      renderer.create(
        "line",
        {
          x1: bx,
          y1: topExtent,
          x2: bx,
          y2: bottomY + LAYOUT.tickLength + 20,
          stroke: color,
          "stroke-width": 1
        },
        g
      );
    }
  }
  /** Contiguous runs of leaves sharing the same prefix up to `level`. */
  segmentsForLevel(leaves, level) {
    const segments = [];
    const prefixKey = (leaf) => leaf.slice(0, level + 1).join("\0");
    let start = 0;
    for (let i = 1; i <= leaves.length; i++) {
      if (i === leaves.length || prefixKey(leaves[i]) !== prefixKey(leaves[start])) {
        segments.push({
          label: leaves[start][level],
          startLeaf: start,
          endLeaf: i - 1
        });
        start = i;
      }
    }
    return segments;
  }
};

// src/core/tooltip.ts
var Tooltip = class {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.el = document.createElement("div");
    this.el.className = "facet-tooltip";
    Object.assign(this.el.style, {
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
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(this.el);
  }
  show(ctx, seriesTip) {
    if (this.options.enabled === false) return;
    this.el.innerHTML = this.content(ctx, seriesTip);
    this.el.style.opacity = "1";
  }
  move(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    let x = clientX - rect.left + 12;
    let y = clientY - rect.top + 12;
    const w = this.el.offsetWidth;
    if (x + w > rect.width) x = clientX - rect.left - w - 12;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }
  hide() {
    this.el.style.opacity = "0";
  }
  destroy() {
    this.el.remove();
  }
  content(ctx, tip) {
    const opts = { ...this.options, ...tip };
    if (opts.formatter) return opts.formatter(ctx);
    const fmt = (v) => formatNumber(v, { decimals: opts.valueDecimals, prefix: opts.valuePrefix, suffix: opts.valueSuffix });
    const valueStr = fmt(ctx.y);
    if (ctx.points && ctx.points.length) {
      const rows = ctx.points.map(
        (r) => `<span style="color:${r.color}">\u25CF</span> ${r.series}: <b>${fmt(r.y)}</b>`
      );
      return `<b>${ctx.x}</b><br/>${rows.join("<br/>")}`;
    }
    if (opts.format) {
      return formatString(opts.format, {
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
    }
    const head = `<span style="color:${ctx.color}">\u25CF</span> <b>${ctx.series}</b><br/>${ctx.x}`;
    if (ctx.box) {
      const b = ctx.box;
      const row = (k, v) => `${k}: <b>${fmt(v)}</b>`;
      return `${head}<br/>` + [
        row("Maximum", b.max),
        row("Upper quartile", b.q3),
        row("Median", b.median),
        row("Lower quartile", b.q1),
        row("Minimum", b.min)
      ].join("<br/>");
    }
    if (ctx.low !== void 0 && ctx.high !== void 0) {
      return `${head}<br/>${fmt(ctx.low)} \u2013 <b>${fmt(ctx.high)}</b>`;
    }
    return `${head}: <b>${valueStr}</b>`;
  }
};

// src/core/legend.ts
var SWATCH = 12;
var CHAR_W = 7;
var ITEM_GAP = 18;
var ROW_H = 20;
var Legend = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  /** Estimated width of a vertical legend column (for space reservation). */
  static verticalWidth(items) {
    const longest = items.reduce((m, it) => Math.max(m, it.label.length), 0);
    return SWATCH + 8 + longest * CHAR_W + 8;
  }
  render(parent) {
    if (this.cfg.options.enabled === false || !this.cfg.items.length) return;
    const g = this.cfg.renderer.group({ class: "facet-legend" }, parent);
    if (this.cfg.layout === "vertical") this.renderVertical(g);
    else this.renderHorizontal(g);
  }
  drawItem(g, it, index, x, y) {
    const { renderer, onToggle } = this.cfg;
    const item = renderer.group({ class: "facet-legend-item", style: "cursor:pointer" }, g);
    renderer.create("rect", {
      x,
      y,
      width: SWATCH,
      height: SWATCH,
      rx: 2,
      fill: it.visible ? it.color : THEME.legend.hiddenColor
    }, item);
    const label = renderer.text(it.label, x + SWATCH + 6, y + SWATCH - 2, {
      ...FONTS.legend,
      fill: it.visible ? FONTS.legend.fill : THEME.legend.hiddenColor,
      "text-decoration": it.visible ? "none" : "line-through"
    }, item);
    label.style.userSelect = "none";
    item.addEventListener("click", () => onToggle(index));
  }
  renderHorizontal(g) {
    const { items, options, width, x: originX, y } = this.cfg;
    const widths = items.map((it) => SWATCH + 6 + it.label.length * CHAR_W + ITEM_GAP);
    const rows = [[]];
    let rowWidth = 0;
    widths.forEach((w, i) => {
      if (rowWidth + w > width && rows[rows.length - 1].length) {
        rows.push([]);
        rowWidth = 0;
      }
      rows[rows.length - 1].push(i);
      rowWidth += w;
    });
    rows.forEach((row, r) => {
      const totalW = row.reduce((s, i) => s + widths[i], 0);
      let startX = originX;
      if (options.align === "right") startX = originX + width - totalW;
      else if (options.align !== "left") startX = originX + (width - totalW) / 2;
      let cx = startX;
      const rowY = y + r * ROW_H;
      for (const i of row) {
        this.drawItem(g, items[i], i, cx, rowY);
        cx += widths[i];
      }
    });
  }
  renderVertical(g) {
    const { items, x, y } = this.cfg;
    items.forEach((it, i) => this.drawItem(g, it, i, x, y + i * ROW_H));
  }
};

// src/core/events.ts
var EventEmitter = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  on(event, listener) {
    let set = this.handlers.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.handlers.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }
  off(event, listener) {
    this.handlers.get(event)?.delete(listener);
  }
  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const listener of set) listener(payload);
  }
  clear() {
    this.handlers.clear();
  }
};

// src/core/point.ts
function normalizePoints(data, categories) {
  return data.map((raw, index) => normalizePoint(raw, index, categories));
}
function normalizePoint(raw, index, categories) {
  const catX = categories?.[index] ?? index;
  if (raw === null) {
    return { x: catX, index, options: {} };
  }
  if (typeof raw === "number") {
    return { x: catX, index, y: raw, options: { y: raw } };
  }
  if (Array.isArray(raw)) {
    const [x, a, b] = raw;
    if (b !== void 0) {
      return {
        x,
        index,
        low: a,
        high: b,
        options: { x, low: a, high: b }
      };
    }
    return { x, index, y: a, options: { x, y: a } };
  }
  const opts = raw;
  const nameOrCat = opts.name !== void 0 && opts.name !== "" ? opts.name : catX;
  const point = {
    x: opts.x ?? nameOrCat,
    index,
    y: opts.y,
    low: opts.low,
    high: opts.high,
    name: opts.name,
    color: opts.color,
    options: opts
  };
  if (opts.min !== void 0 && opts.q1 !== void 0 && opts.median !== void 0 && opts.q3 !== void 0 && opts.max !== void 0) {
    point.box = {
      min: opts.min,
      q1: opts.q1,
      median: opts.median,
      q3: opts.q3,
      max: opts.max
    };
  }
  return point;
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
    this.options = options;
    this.type = options.type ?? "line";
    this.name = options.name ?? `Series ${""}`;
    this.visible = options.visible !== false;
    this.points = normalizePoints(options.data, categories);
  }
  /** Points that should actually be drawn (respects per-point hiding). */
  visiblePoints() {
    if (this.hiddenPoints.size === 0) return this.points;
    return this.points.filter((p) => !this.hiddenPoints.has(p.index));
  }
  /**
   * The [min, max] value range this series contributes to the value axis,
   * given whether it is stacked (stack totals are precomputed on points).
   */
  valueExtent() {
    let min = Infinity;
    let max = -Infinity;
    for (const p of this.points) {
      for (const v of this.pointValues(p)) {
        if (v === void 0) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) return [0, 1];
    return [min, max];
  }
  /** Values a point contributes to the value axis. Overridden by range/box. */
  pointValues(p) {
    if (p.stackHigh !== void 0) return [p.stackLow, p.stackHigh];
    return [p.y];
  }
  /**
   * Return a shallow clone of this series containing only the points whose
   * option fields match every entry in `filters` (ignoring empty keys / values).
   * Used by the trellis engine to split a series across small-multiple panels.
   */
  filterByDimensions(filters) {
    const active = Object.entries(filters).filter(
      ([k, v]) => k !== "" && v !== void 0
    );
    if (!active.length) return this;
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.points = this.points.filter(
      (p) => active.every(([k, v]) => String(p.options[k]) === String(v))
    );
    return clone;
  }
  /** Return a shallow clone of this series with a replaced point set. */
  withPoints(points) {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.points = points;
    return clone;
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

// src/series/data-label.ts
function labelString(dl, ctx) {
  if (dl.formatter) return dl.formatter(ctx);
  const data = {
    ...ctx,
    y: ctx.y ?? "",
    name: ctx.name ?? ctx.point?.name ?? ctx.x
  };
  return formatString(dl.format ?? "{y}", data);
}
function drawDataLabel(renderer, parent, text, place, dl) {
  if (!text) return;
  const attrs = {
    "text-anchor": place.anchor,
    ...FONTS.dataLabel,
    fill: dl.color ?? FONTS.dataLabel.fill,
    "font-size": dl.fontSize ?? FONTS.dataLabel["font-size"]
  };
  if (dl.fontWeight) attrs["font-weight"] = dl.fontWeight;
  if (dl.rotation) attrs.transform = `rotate(${dl.rotation} ${place.x} ${place.y})`;
  if (dl.backgroundColor) {
    const w = text.length * 6.5 + 8;
    const anchorX = place.anchor === "start" ? place.x - 4 : place.anchor === "end" ? place.x - w + 4 : place.x - w / 2;
    renderer.create("rect", {
      x: anchorX,
      y: place.y - 11,
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
  const d = dl.distance ?? 0;
  const pos = dl.position ?? "top";
  const total = data.reduce((sum2, { p }) => sum2 + (p.y ?? 0), 0);
  for (const { pt, p } of data) {
    const text = labelString(dl, {
      x: p.x,
      y: p.y,
      point: p.options,
      series: seriesName,
      name: p.name ?? p.x,
      index: p.index,
      color: p.color ?? seriesColor,
      total,
      percentage: total ? (p.y ?? 0) / total * 100 : void 0
    });
    let place;
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

// src/series/column.ts
var ColumnSeries = class extends BaseSeries {
  get horizontal() {
    return this.type === "bar";
  }
  capabilities() {
    return { grouped: true, cartesian: true, stackable: true };
  }
  pointValues(p) {
    if (p.stackHigh !== void 0) return [p.stackLow, p.stackHigh];
    return [0, p.y];
  }
  render(ctx) {
    const { renderer, groupCount, groupIndex } = ctx;
    const catScale = this.horizontal ? ctx.yScale : ctx.xScale;
    const valScale = this.horizontal ? ctx.xScale : ctx.yScale;
    const g = renderer.group({
      class: `facet-series facet-column ${this.name}`
    });
    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    for (const p of this.points) {
      const [loVal, hiVal] = this.valuePair(p);
      if (loVal === void 0 || hiVal === void 0) continue;
      const center = catScale.scale(p.x);
      const catStart = center - band / 2 + groupIndex * subWidth;
      const vLo = valScale.scale(loVal);
      const vHi = valScale.scale(hiVal);
      let rect;
      if (this.horizontal) {
        rect = {
          x: Math.min(vLo, vHi),
          y: catStart,
          width: Math.max(1, Math.abs(vHi - vLo)),
          height: Math.max(1, subWidth * 0.9)
        };
      } else {
        rect = {
          x: catStart,
          y: Math.min(vLo, vHi),
          width: Math.max(1, subWidth * 0.9),
          height: Math.max(1, Math.abs(vHi - vLo))
        };
      }
      const el = renderer.create(
        "rect",
        {
          ...rect,
          rx: 0,
          fill: p.color ?? this.color,
          class: "facet-point"
        },
        g
      );
      ctx.registerHover(el, p);
      this.wireEvents(el, p, ctx);
      this.drawDataLabel(ctx, p, rect);
    }
    renderer.root.appendChild(g);
  }
  /** The [low, high] value pair driving the rectangle for this point. */
  valuePair(p) {
    if (p.stackHigh !== void 0) return [p.stackLow, p.stackHigh];
    return [0, p.y];
  }
  wireEvents(el, p, ctx) {
    el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
    el.addEventListener(
      "mouseover",
      (e) => ctx.onPointEvent("mouseOver", p, e)
    );
    el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
  }
  drawDataLabel(ctx, p, rect) {
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
      percentage: total ? (p.y ?? 0) / total * 100 : void 0
    });
    const d = dl.distance ?? 0;
    const pos = dl.position ?? "outside";
    let place;
    if (this.horizontal) {
      const cy = rect.y + rect.height / 2 + 4;
      const end = rect.x + rect.width;
      if (pos === "inside") place = { x: end - 4 - d, y: cy, anchor: "end" };
      else if (pos === "center")
        place = { x: rect.x + rect.width / 2, y: cy, anchor: "middle" };
      else if (pos === "base")
        place = { x: rect.x + 4 + d, y: cy, anchor: "start" };
      else place = { x: end + 4 + d, y: cy, anchor: "start" };
    } else {
      const cx = rect.x + rect.width / 2;
      if (pos === "inside")
        place = { x: cx, y: rect.y + 12 + d, anchor: "middle" };
      else if (pos === "center")
        place = { x: cx, y: rect.y + rect.height / 2 + 4, anchor: "middle" };
      else if (pos === "base")
        place = { x: cx, y: rect.y + rect.height - 5 - d, anchor: "middle" };
      else place = { x: cx, y: rect.y - 4 - d, anchor: "middle" };
    }
    drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
  }
};

// src/series/paths.ts
function linePath(pts) {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}
function splinePath(pts, tension = 0.5) {
  if (pts.length < 3) return linePath(pts);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6 * tension * 2;
    const cp1y = p1.y + (p2.y - p0.y) / 6 * tension * 2;
    const cp2x = p2.x - (p3.x - p1.x) / 6 * tension * 2;
    const cp2y = p2.y - (p3.y - p1.y) / 6 * tension * 2;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
function stepPath(pts) {
  if (!pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const midX = (pts[i - 1].x + pts[i].x) / 2;
    d += ` L ${midX} ${pts[i - 1].y} L ${midX} ${pts[i].y} L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

// src/series/marker.ts
function drawMarker(renderer, parent, cx, cy, spec) {
  const { symbol, radius: r, fill, stroke, strokeWidth } = spec;
  const common = { fill, stroke, "stroke-width": strokeWidth, class: "facet-point" };
  switch (symbol) {
    case "square":
      return renderer.create("rect", { x: cx - r, y: cy - r, width: r * 2, height: r * 2, ...common }, parent);
    case "diamond":
      return renderer.create("polygon", {
        points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`,
        ...common
      }, parent);
    case "triangle":
      return renderer.create("polygon", {
        points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`,
        ...common
      }, parent);
    case "circle":
    default:
      return renderer.create("circle", { cx, cy, r, ...common }, parent);
  }
}

// src/series/range.ts
var RangeSeries = class extends BaseSeries {
  smooth() {
    return this.type === "areasplinerange";
  }
  capabilities() {
    return { grouped: false, cartesian: true, stackable: false };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    const { renderer, xScale, yScale } = ctx;
    const g = renderer.group({ class: `facet-series facet-arearange ${this.name}` }, renderer.root);
    const top = [];
    const bottom = [];
    const drawn = [];
    for (const p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      const x = xScale.scale(p.x);
      top.push({ x, y: yScale.scale(p.high) });
      bottom.push({ x, y: yScale.scale(p.low) });
      drawn.push(p);
    }
    if (!top.length) return;
    const line = this.smooth() ? splinePath : linePath;
    const topD = line(top);
    const bottomD = line([...bottom].reverse()).replace(/^M/, "L");
    renderer.create("path", { d: `${topD} ${bottomD} Z`, fill: alpha(this.color, 0.35), stroke: "none" }, g);
    renderer.create("path", { d: topD, fill: "none", stroke: this.color, "stroke-width": this.options.lineWidth ?? 2 }, g);
    renderer.create("path", { d: line(bottom), fill: "none", stroke: this.color, "stroke-width": this.options.lineWidth ?? 2 }, g);
    drawn.forEach((p, i) => {
      for (const pt of [top[i], bottom[i]]) {
        const el = drawMarker(renderer, g, pt.x, pt.y, {
          symbol: "circle",
          radius: 3.5,
          fill: this.color,
          stroke: "#fff",
          strokeWidth: 1
        });
        ctx.registerHover(el, p);
        el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
        el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
        el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      }
    });
  }
};

// src/series/line.ts
var LineSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: true, stackable: true };
  }
  pixelPoints(ctx) {
    const out = [];
    for (const p of this.points) {
      const y = p.stackHigh !== void 0 ? p.stackHigh : p.y;
      if (y === void 0) continue;
      out.push({ pt: { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(y) }, p });
    }
    return out;
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
    const { renderer } = ctx;
    const g = renderer.group({ class: `facet-series facet-line ${this.name}` }, renderer.root);
    const data = this.pixelPoints(ctx);
    const pts = data.map((d) => d.pt);
    renderer.create("path", {
      d: this.buildPath(pts),
      fill: "none",
      stroke: this.color,
      "stroke-width": this.options.lineWidth ?? 2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }, g);
    this.renderMarkers(ctx, g, data);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, data, this.color);
  }
  renderMarkers(ctx, g, data) {
    const marker = this.options.marker;
    const visible = marker?.enabled === true;
    for (const { pt, p } of data) {
      let el;
      if (visible) {
        el = drawMarker(ctx.renderer, g, pt.x, pt.y, {
          symbol: marker.symbol ?? "circle",
          radius: marker.radius ?? 4,
          fill: marker.fillColor ?? this.color,
          stroke: marker.lineColor ?? "#fff",
          strokeWidth: marker.lineWidth ?? 1
        });
      } else {
        el = ctx.renderer.create("circle", {
          cx: pt.x,
          cy: pt.y,
          r: 8,
          fill: "transparent",
          "pointer-events": "all",
          class: "facet-point-hit"
        }, g);
      }
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
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
    const { renderer } = ctx;
    const g = renderer.group({ class: `facet-series facet-area ${this.name}` }, renderer.root);
    const top = [];
    const bottom = [];
    const hover = [];
    for (const p of this.points) {
      const hi = p.stackHigh !== void 0 ? p.stackHigh : p.y;
      if (hi === void 0) continue;
      const lo = p.stackLow !== void 0 ? p.stackLow : 0;
      const topPt = { x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(hi) };
      top.push(topPt);
      bottom.push({ x: ctx.xScale.scale(p.x), y: ctx.yScale.scale(lo) });
      hover.push({ pt: topPt, p });
    }
    if (top.length) {
      const line = this.smooth() ? splinePath : linePath;
      const topD = line(top);
      const bottomReversed = [...bottom].reverse();
      const bottomD = line(bottomReversed).replace(/^M/, "L");
      renderer.create("path", {
        d: `${topD} ${bottomD} Z`,
        fill: alpha(this.color, 0.35),
        stroke: "none"
      }, g);
      renderer.create("path", {
        d: topD,
        fill: "none",
        stroke: this.color,
        "stroke-width": this.options.lineWidth ?? 2,
        "stroke-linejoin": "round"
      }, g);
    }
    this.renderMarkers(ctx, g, hover);
    drawPointLabels(ctx.renderer, g, this.options.dataLabels, this.name, hover, this.color);
  }
};

// src/series/scatter.ts
var ScatterSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: true, stackable: false };
  }
  get isJitter() {
    return this.type === "jitter";
  }
  render(ctx) {
    const { renderer, xScale } = ctx;
    const g = renderer.group({ class: `facet-series facet-scatter ${this.name}` }, renderer.root);
    const marker = this.options.marker ?? {};
    const rng = seededRandom(this.index * 7919 + this.points.length + 1);
    const band = xScale instanceof CategoryScale ? xScale.bandwidth() : 0;
    const spread = (this.options.jitter ?? 0.5) * band;
    const labelData = [];
    for (const p of this.points) {
      if (p.y === void 0) continue;
      let x = xScale.scale(p.x);
      if (this.isJitter && band > 0) {
        x += (rng() - 0.5) * spread;
      }
      const y = ctx.yScale.scale(p.y);
      labelData.push({ pt: { x, y }, p });
      const el = drawMarker(renderer, g, x, y, {
        symbol: marker.symbol ?? "circle",
        radius: marker.radius ?? 5,
        fill: p.color ?? marker.fillColor ?? this.color,
        stroke: marker.lineColor ?? "#ffffff",
        strokeWidth: marker.lineWidth ?? 1
      });
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
    drawPointLabels(renderer, g, this.options.dataLabels, this.name, labelData, this.color);
  }
};

// src/series/pie.ts
var PieSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }
  dims() {
    const d = this.options.dimensions;
    return Array.isArray(d) && d.length >= 2 ? d : void 0;
  }
  /** Distinct first-dimension groups (encounter order) for multi-level pies. */
  groups() {
    const dims = this.dims();
    if (!dims) return [];
    const seen = [];
    for (const p of this.points) {
      const k = String(p.options[dims[0]] ?? "");
      if (!seen.includes(k)) seen.push(k);
    }
    return seen;
  }
  innerRatio() {
    if (this.type === "donut") {
      return this.parsePercent(this.options.innerSize ?? "60%");
    }
    return this.options.innerSize ? this.parsePercent(this.options.innerSize) : 0;
  }
  parsePercent(v) {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : Math.min(0.95, Math.max(0, n / 100));
  }
  render(ctx) {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-pie ${this.name}` }, renderer.root);
    const dl = this.options.dataLabels;
    const outside = !!dl?.enabled && (dl.position ?? "outside") !== "inside";
    const margin = outside ? 48 : 6;
    const c = {
      cx: plot.x + plot.width / 2,
      cy: plot.y + plot.height / 2,
      radius: Math.max(10, Math.min(plot.width, plot.height) / 2 - margin),
      margin,
      outside
    };
    if (this.dims()) {
      this.renderMultiLevel(ctx, g, c);
      return;
    }
    const innerR = c.radius * this.innerRatio();
    const points = this.visiblePoints();
    const total = sum(points.map((p) => p.y ?? 0));
    if (total <= 0) return;
    const zs = points.map((p) => p.options.z).filter((z) => typeof z === "number");
    const variable = zs.length > 0;
    const zMin = variable ? Math.min(...zs) : 0;
    const zMax = variable ? Math.max(...zs) : 1;
    const minR = innerR + (c.radius - innerR) * 0.45;
    const radiusFor = (p) => {
      const z = p.options.z;
      if (!variable || typeof z !== "number") return c.radius;
      return minR + (c.radius - minR) * (zMax === zMin ? 1 : (z - zMin) / (zMax - zMin));
    };
    let angle = -Math.PI / 2;
    points.forEach((p) => {
      const value = p.y ?? 0;
      if (value <= 0) return;
      const sweep = value / total * Math.PI * 2;
      const end = angle + sweep;
      const color = p.color ?? paletteColor(ctx.colors, this.points.indexOf(p));
      const rr = radiusFor(p);
      const path = this.slicePath(c.cx, c.cy, rr, innerR, angle, end);
      const el = renderer.create("path", { d: path, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      const label = this.labelText(p, p.name ?? p.x, value, total);
      this.drawLabel(ctx, g, c, rr, (angle + end) / 2, label, color);
      angle = end;
    });
  }
  /** Two-dimension pie: inner ring = first field, outer ring = second field. */
  renderMultiLevel(ctx, g, c) {
    const dims = this.dims();
    const { renderer } = ctx;
    const holeR = c.radius * this.innerRatio();
    const midR = holeR + (c.radius - holeR) * 0.55;
    const order = this.groups();
    const buckets = /* @__PURE__ */ new Map();
    for (const g0 of order) buckets.set(g0, []);
    for (const p of this.visiblePoints()) {
      const k = String(p.options[dims[0]] ?? "");
      buckets.get(k)?.push(p);
    }
    const groupTotal = (ps) => sum(ps.map((p) => p.y ?? 0));
    const total = sum([...buckets.values()].map(groupTotal));
    if (total <= 0) return;
    let angle = -Math.PI / 2;
    order.forEach((g0, gi) => {
      const ps = buckets.get(g0) ?? [];
      const gVal = groupTotal(ps);
      if (gVal <= 0) return;
      const sweep = gVal / total * Math.PI * 2;
      const end = angle + sweep;
      const base = paletteColor(ctx.colors, gi);
      const innerPath = this.slicePath(c.cx, c.cy, midR, holeR, angle, end);
      renderer.create("path", { d: innerPath, fill: base, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      const innerLabelR = (holeR + midR) / 2;
      const mid = (angle + end) / 2;
      const chord = 2 * innerLabelR * Math.sin(Math.min(Math.PI, sweep) / 2);
      const bandThickness = midR - holeR;
      const fitted = this.fitText(g0, Math.max(chord, bandThickness) - 4, 6.8);
      if (fitted) {
        renderer.text(fitted, c.cx + innerLabelR * Math.cos(mid), c.cy + innerLabelR * Math.sin(mid), {
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          ...FONTS.dataLabel,
          fill: "#ffffff",
          "font-weight": "600"
        }, g);
      }
      let a2 = angle;
      ps.forEach((p, j) => {
        const value = p.y ?? 0;
        if (value <= 0) return;
        const cs = value / gVal * sweep;
        const e2 = a2 + cs;
        const color = p.color ?? shade(base, 0.12 + 0.5 * (ps.length === 1 ? 0 : j / (ps.length - 1)));
        const outerPath = this.slicePath(c.cx, c.cy, c.radius, midR, a2, e2);
        const el = renderer.create("path", { d: outerPath, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
        ctx.registerHover(el, p);
        el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
        el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
        el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
        const name = String(p.options[dims[1]] ?? p.name ?? p.x);
        const label = this.labelText(p, name, value, total);
        this.drawLabel(ctx, g, c, c.radius, (a2 + e2) / 2, label, color);
        a2 = e2;
      });
      angle = end;
    });
  }
  // -- Legend (multi-level lists the inner-dimension groups) --------------
  legendItems(colors) {
    const dims = this.dims();
    if (!dims) return void 0;
    return this.groups().map((g0, i) => ({
      label: g0,
      color: paletteColor(colors, i),
      visible: this.points.some((p) => String(p.options[dims[0]] ?? "") === g0 && !this.hiddenPoints.has(p.index))
    }));
  }
  onLegendToggle(index) {
    const dims = this.dims();
    if (!dims) return;
    const g0 = this.groups()[index];
    const pts = this.points.filter((p) => String(p.options[dims[0]] ?? "") === g0);
    const anyVisible = pts.some((p) => !this.hiddenPoints.has(p.index));
    for (const p of pts) {
      if (anyVisible) this.hiddenPoints.add(p.index);
      else this.hiddenPoints.delete(p.index);
    }
  }
  /**
   * Truncate `text` with an ellipsis to fit `availablePx`. Returns '' when even
   * a single character won't fit (label omitted entirely).
   */
  fitText(text, availablePx, charW) {
    const maxChars = Math.floor(availablePx / charW);
    if (maxChars < 1) return "";
    if (text.length <= maxChars) return text;
    if (maxChars === 1) return text.slice(0, 1);
    return text.slice(0, maxChars - 1) + "\u2026";
  }
  /** Build the label string for a slice from the series' dataLabels config. */
  labelText(p, name, value, total) {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return "";
    const percentage = total ? value / total * 100 : 0;
    const label = name ?? "";
    if (dl.formatter) {
      return dl.formatter({ x: p.x, y: value, point: p.options, series: this.name, name: label, index: p.index, color: p.color, percentage, total });
    }
    return formatString(dl.format ?? "{name}: {percentage:.1f}%", {
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
   * Draw a slice label. Inside labels sit on the ring; outside labels are placed
   * beyond the rim and joined to the slice with a leader line (elbow + stub) so
   * it is unambiguous which label belongs to which slice.
   */
  drawLabel(ctx, g, c, rimR, mid, text, sliceColor) {
    const dl = this.options.dataLabels;
    if (!dl?.enabled || !text) return;
    const { renderer } = ctx;
    if (!c.outside) {
      const lr = rimR * 0.72;
      renderer.text(text, c.cx + lr * Math.cos(mid), c.cy + lr * Math.sin(mid), {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: dl.color ?? "#ffffff",
        ...dl.fontSize ? { "font-size": dl.fontSize } : {}
      }, g);
      return;
    }
    const dir = Math.cos(mid) >= 0 ? 1 : -1;
    const rimX = c.cx + rimR * Math.cos(mid);
    const rimY = c.cy + rimR * Math.sin(mid);
    const elbowR = rimR + 10 + (dl.distance ?? 0);
    const elbowX = c.cx + elbowR * Math.cos(mid);
    const elbowY = c.cy + elbowR * Math.sin(mid);
    const stubX = elbowX + dir * 16;
    renderer.create("polyline", {
      points: `${rimX},${rimY} ${elbowX},${elbowY} ${stubX},${elbowY}`,
      fill: "none",
      stroke: dl.color ?? sliceColor,
      "stroke-width": 1
    }, g);
    renderer.text(text, stubX + dir * 4, elbowY, {
      "text-anchor": dir > 0 ? "start" : "end",
      "dominant-baseline": "middle",
      ...FONTS.dataLabel,
      fill: dl.color ?? FONTS.dataLabel.fill,
      ...dl.fontSize ? { "font-size": dl.fontSize } : {}
    }, g);
  }
  slicePath(cx, cy, r, ir, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    if (ir <= 0) {
      return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    }
    const ix0 = cx + ir * Math.cos(a1);
    const iy0 = cy + ir * Math.sin(a1);
    const ix1 = cx + ir * Math.cos(a0);
    const iy1 = cy + ir * Math.sin(a0);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix0} ${iy0} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`;
  }
};

// src/series/boxplot.ts
var BoxplotSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: true, cartesian: true, stackable: false };
  }
  pointValues(p) {
    return p.box ? [p.box.min, p.box.max] : [p.low, p.high];
  }
  render(ctx) {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = inverted ? ctx.yScale : ctx.xScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const layer = renderer.group({ class: `facet-series facet-boxplot ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    const boxWidth = subWidth * 0.7;
    const half = boxWidth / 2;
    const v = (val) => valScale.scale(val);
    for (const p of this.points) {
      const box = p.box;
      if (!box) continue;
      const base = p.color ?? this.color;
      const bc = this.options.boxColors ?? {};
      const upperFill = bc.upper ?? shade(base, 0.15);
      const lowerFill = bc.lower ?? shade(base, 0.5);
      const stroke = bc.border ?? shade(base, -0.25);
      const whisker = bc.whisker ?? stroke;
      const medianColor = bc.median ?? stroke;
      const c = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const lo = c - half;
      const valLine = (a, b) => inverted ? { x1: v(a), y1: c, x2: v(b), y2: c } : { x1: c, y1: v(a), x2: c, y2: v(b) };
      const cap = (val, len) => inverted ? { x1: v(val), y1: c - len, x2: v(val), y2: c + len } : { x1: c - len, y1: v(val), x2: c + len, y2: v(val) };
      const boxRect = (a, b) => {
        const va = v(a), vb = v(b);
        return inverted ? { x: Math.min(va, vb), y: lo, width: Math.max(1, Math.abs(vb - va)), height: boxWidth } : { x: lo, y: Math.min(va, vb), width: boxWidth, height: Math.max(1, Math.abs(vb - va)) };
      };
      const medLine = () => inverted ? { x1: v(box.median), y1: lo, x2: v(box.median), y2: lo + boxWidth } : { x1: lo, y1: v(box.median), x2: lo + boxWidth, y2: v(box.median) };
      const g = renderer.group({ class: "facet-point" }, layer);
      renderer.create("line", { ...valLine(box.min, box.q1), stroke: whisker, "stroke-width": 1 }, g);
      renderer.create("line", { ...valLine(box.q3, box.max), stroke: whisker, "stroke-width": 1 }, g);
      renderer.create("line", { ...cap(box.min, half * 0.7), stroke: whisker }, g);
      renderer.create("line", { ...cap(box.max, half * 0.7), stroke: whisker }, g);
      renderer.create("rect", { ...boxRect(box.median, box.q3), fill: upperFill, stroke, "stroke-width": 1 }, g);
      renderer.create("rect", { ...boxRect(box.q1, box.median), fill: lowerFill, stroke, "stroke-width": 1 }, g);
      renderer.create("line", { ...medLine(), stroke: medianColor, "stroke-width": 2 }, g);
      ctx.registerHover(g, p);
      g.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      g.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      g.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
  }
};
function computeBoxStats(values) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => {
    const idx = p * (s.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[s.length - 1] };
}

// src/series/dumbbell.ts
var DumbbellSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: true, cartesian: true, stackable: false };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = inverted ? ctx.yScale : ctx.xScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group({ class: `facet-series facet-dumbbell ${this.name}` }, renderer.root);
    const band = catScale.bandwidth ? catScale.bandwidth() : 0;
    const subWidth = band / groupCount;
    const radius = this.options.marker?.radius ?? 5;
    const lowColor = this.options.lowColor ?? this.color;
    const highColor = this.options.highColor ?? this.color;
    const connColor = this.options.connectorColor ?? THEME.neutralColor;
    const connWidth = this.options.connectorWidth ?? 3;
    for (const p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      const cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vLow = valScale.scale(p.low);
      const vHigh = valScale.scale(p.high);
      const conn = inverted ? { x1: vLow, y1: cat, x2: vHigh, y2: cat } : { x1: cat, y1: vLow, x2: cat, y2: vHigh };
      renderer.create("line", {
        ...conn,
        stroke: connColor,
        "stroke-width": connWidth,
        "stroke-linecap": "round"
      }, g);
      for (const [v, color] of [[vLow, lowColor], [vHigh, highColor]]) {
        const cx = inverted ? v : cat;
        const cy = inverted ? cat : v;
        const el = drawMarker(renderer, g, cx, cy, {
          symbol: this.options.marker?.symbol ?? "circle",
          radius,
          fill: color,
          stroke: "#fff",
          strokeWidth: 1.5
        });
        ctx.registerHover(el, p);
        el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
        el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
        el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      }
      this.drawEndLabels(ctx, p, cat, valScale, inverted, radius);
    }
  }
  /** Labels at the low and high ends (both values shown by default). */
  drawEndLabels(ctx, p, cat, valScale, inverted, radius) {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const ends = [
      { val: p.low, isHigh: false },
      { val: p.high, isHigh: true }
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
        color: p.color ?? this.color
      });
      const d = dl.distance ?? 0;
      let place;
      if (inverted) {
        place = end.isHigh ? { x: v + radius + 6 + d, y: cat + 4, anchor: "start" } : { x: v - radius - 6 - d, y: cat + 4, anchor: "end" };
      } else {
        place = end.isHigh ? { x: cat, y: v - radius - 6 - d, anchor: "middle" } : { x: cat, y: v + radius + 14 + d, anchor: "middle" };
      }
      drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
};

// src/series/radialbar.ts
var RadialBarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-radialbar ${this.name}` }, renderer.root);
    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const outer = Math.min(plot.width, plot.height) / 2 - 4;
    const points = this.visiblePoints();
    const max = Math.max(1, ...points.map((p) => p.y ?? 0));
    const n = points.length || 1;
    const ringWidth = outer * 0.7 / n;
    const gap = ringWidth * 0.25;
    const startAngle = -Math.PI / 2;
    const fullSweep = Math.PI * 2 * 270 / 360;
    const labelX = cx - 8;
    points.forEach((p, i) => {
      const value = p.y ?? 0;
      const rOuter = outer - i * ringWidth;
      const rInner = rOuter - (ringWidth - gap);
      const color = p.color ?? paletteColor(colors, this.points.indexOf(p));
      const frac = Math.max(0, Math.min(1, value / max));
      renderer.create("path", {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep),
        fill: alpha(color, 0.15),
        stroke: "none"
      }, g);
      const el = renderer.create("path", {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep * frac),
        fill: color,
        stroke: "none",
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      renderer.text(String(p.name ?? p.x), labelX, cy - (rInner + rOuter) / 2 + 4, {
        "text-anchor": "end",
        ...FONTS.dataLabel,
        "font-size": "10px"
      }, g);
    });
  }
  /** A filled band between two radii swept between two angles. */
  arcBand(cx, cy, ri, ro, a0, a1) {
    if (a1 <= a0 + 1e-4) return "";
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const ox0 = cx + ro * Math.cos(a0);
    const oy0 = cy + ro * Math.sin(a0);
    const ox1 = cx + ro * Math.cos(a1);
    const oy1 = cy + ro * Math.sin(a1);
    const ix1 = cx + ri * Math.cos(a1);
    const iy1 = cy + ri * Math.sin(a1);
    const ix0 = cx + ri * Math.cos(a0);
    const iy0 = cy + ri * Math.sin(a0);
    return `M ${ox0} ${oy0} A ${ro} ${ro} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${ri} ${ri} 0 ${large} 0 ${ix0} ${iy0} Z`;
  }
};

// src/series/columnrange.ts
var ColumnRangeSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: true, cartesian: true, stackable: false };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = inverted ? ctx.yScale : ctx.xScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group({ class: `facet-series facet-columnrange ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const subWidth = band / groupCount;
    const thickness = Math.min(subWidth * 0.55, 26);
    for (const p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      const cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth;
      const vLow = valScale.scale(p.low);
      const vHigh = valScale.scale(p.high);
      const coords = inverted ? { x1: vLow, y1: cat, x2: vHigh, y2: cat } : { x1: cat, y1: vLow, x2: cat, y2: vHigh };
      const el = renderer.create("line", {
        ...coords,
        stroke: p.color ?? this.color,
        "stroke-width": thickness,
        "stroke-linecap": "round",
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      this.drawEndLabels(ctx, p, cat, vLow, vHigh, inverted, thickness / 2);
    }
  }
  /** Labels at the low and high ends of the capsule. */
  drawEndLabels(ctx, p, cat, vLow, vHigh, inverted, half) {
    const dl = this.options.dataLabels;
    if (!dl?.enabled) return;
    const ends = [
      { val: p.low, v: vLow, isHigh: false },
      { val: p.high, v: vHigh, isHigh: true }
    ];
    for (const end of ends) {
      const text = labelString(dl, {
        x: p.x,
        y: end.val,
        low: p.low,
        high: p.high,
        point: p.options,
        series: this.name,
        name: p.name ?? p.x,
        index: p.index,
        color: p.color ?? this.color
      });
      const d = (dl.distance ?? 0) + half + 4;
      let place;
      if (inverted) {
        place = end.isHigh ? { x: end.v + d, y: cat + 4, anchor: "start" } : { x: end.v - d, y: cat + 4, anchor: "end" };
      } else {
        place = end.isHigh ? { x: cat, y: end.v - d, anchor: "middle" } : { x: cat, y: end.v + d + 10, anchor: "middle" };
      }
      drawDataLabel(ctx.renderer, ctx.renderer.root, text, place, dl);
    }
  }
};

// src/series/heatmap.ts
var HeatmapSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  axisValues(field) {
    const seen = [];
    for (const p of this.points) {
      const v = String((field === "x" ? p.x : p.options.y) ?? "");
      if (!seen.includes(v)) seen.push(v);
    }
    return seen;
  }
  render(ctx) {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-heatmap ${this.name}` }, renderer.root);
    const cols = this.axisValues("x");
    const rows = this.axisValues("y");
    if (!cols.length || !rows.length) return;
    const leftPad = 8 + rows.reduce((m, r) => Math.max(m, r.length), 0) * 6.6;
    const bottomPad = 22;
    const gx = plot.x + leftPad;
    const gy = plot.y + 6;
    const gw = plot.width - leftPad - 8;
    const gh = plot.height - bottomPad - 6;
    const cw = gw / cols.length;
    const ch = gh / rows.length;
    const values = this.points.map((p) => p.options.value ?? p.y ?? 0);
    const min = Math.min(...values), max = Math.max(...values);
    const lo = "#eaf3fb";
    const hi = this.color;
    const colorFor = (v) => lerpColor(lo, hi, max === min ? 0.5 : (v - min) / (max - min));
    for (const p of this.points) {
      const ci = cols.indexOf(String(p.x ?? ""));
      const ri = rows.indexOf(String(p.options.y ?? ""));
      if (ci < 0 || ri < 0) continue;
      const value = p.options.value ?? p.y ?? 0;
      const x = gx + ci * cw;
      const y = gy + ri * ch;
      const el = renderer.create("rect", {
        x: x + 1,
        y: y + 1,
        width: cw - 2,
        height: ch - 2,
        rx: 2,
        fill: p.color ?? colorFor(value),
        class: "facet-point"
      }, g);
      if (cw > 26 && ch > 16) {
        renderer.text(String(value), x + cw / 2, y + ch / 2, {
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          ...FONTS.dataLabel,
          fill: (value - min) / (max - min || 1) > 0.6 ? "#fff" : shade(hi, -0.4),
          "font-size": "10px"
        }, g);
      }
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
    cols.forEach((c, i) => {
      renderer.text(c, gx + i * cw + cw / 2, gy + gh + 14, { "text-anchor": "middle", ...FONTS.axisLabel }, g);
    });
    rows.forEach((r, i) => {
      renderer.text(r, gx - 6, gy + i * ch + ch / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g);
    });
    renderer.create("line", { x1: gx, y1: gy + gh, x2: gx + gw, y2: gy + gh, stroke: THEME.axis.lineColor }, g);
  }
};

// src/series/bullet.ts
var BulletSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-bullet ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;
    const labelW = 8 + points.reduce((m, p) => Math.max(m, String(p.name ?? p.x).length), 0) * 6.6;
    const gx = plot.x + labelW;
    const gw = plot.width - labelW - 12;
    const rowH = plot.height / points.length;
    const bandShades = ["#e6e6e6", "#d0d0d0", "#bcbcbc", "#a8a8a8"];
    points.forEach((p, i) => {
      const ranges = p.options.ranges ?? [];
      const target = p.options.target;
      const value = p.y ?? 0;
      const max = Math.max(value, target ?? 0, ...ranges) || 1;
      const sx = (v) => gx + v / max * gw;
      const cy = plot.y + i * rowH + rowH / 2;
      const h = Math.min(rowH * 0.6, 34);
      [...ranges].map((v, idx) => ({ v, idx })).sort((a, b) => b.v - a.v).forEach(({ v, idx }) => {
        renderer.create("rect", { x: gx, y: cy - h / 2, width: sx(v) - gx, height: h, fill: bandShades[idx % bandShades.length] }, g);
      });
      const el = renderer.create("rect", { x: gx, y: cy - h / 5, width: sx(value) - gx, height: h * 2 / 5, fill: p.color ?? this.color, class: "facet-point" }, g);
      if (typeof target === "number") {
        renderer.create("line", { x1: sx(target), y1: cy - h / 2, x2: sx(target), y2: cy + h / 2, stroke: "#333", "stroke-width": 2.5 }, g);
      }
      renderer.text(String(p.name ?? p.x), gx - 6, cy, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
    renderer.create("line", { x1: gx, y1: plot.y, x2: gx, y2: plot.y + plot.height, stroke: THEME.axis.lineColor }, g);
  }
};

// src/series/candlestick.ts
var UP = "#26a69a";
var DOWN = "#ef5350";
var CandlestickSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: true, stackable: false };
  }
  pointValues(p) {
    const o = p.options;
    return [o.low, o.high];
  }
  render(ctx) {
    const { renderer, yScale } = ctx;
    const catScale = ctx.xScale;
    const g = renderer.group({ class: `facet-series facet-candlestick ${this.name}` }, renderer.root);
    const bodyW = Math.min(catScale.bandwidth() * 0.6, 18);
    for (const p of this.points) {
      const o = p.options;
      const open = o.open, close = o.close;
      const high = o.high, low = o.low;
      if ([open, close, high, low].some((v) => typeof v !== "number")) continue;
      const cx = catScale.scale(p.x);
      const up = close >= open;
      const color = p.color ?? (up ? UP : DOWN);
      const cell = renderer.group({ class: "facet-point" }, g);
      renderer.create("line", {
        x1: cx,
        y1: yScale.scale(high),
        x2: cx,
        y2: yScale.scale(low),
        stroke: color,
        "stroke-width": 1
      }, cell);
      const yOpen = yScale.scale(open), yClose = yScale.scale(close);
      renderer.create("rect", {
        x: cx - bodyW / 2,
        y: Math.min(yOpen, yClose),
        width: bodyW,
        height: Math.max(1, Math.abs(yClose - yOpen)),
        fill: color,
        stroke: color
      }, cell);
      ctx.registerHover(cell, p);
      cell.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      cell.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      cell.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    }
  }
};

// src/series/gauge.ts
var START = 135;
var SWEEP = 270;
var GaugeSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-gauge ${this.name}` }, renderer.root);
    const p = this.points[0];
    if (!p) return;
    const min = this.options.min ?? 0;
    const max = this.options.max ?? 100;
    const value = p.y ?? 0;
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height * 0.62;
    const r = Math.min(plot.width * 0.44, plot.height * 0.5) - 6;
    const thickness = Math.max(10, r * 0.16);
    renderer.create("path", { d: this.arc(cx, cy, r, START, START + SWEEP), fill: "none", stroke: THEME.axis.gridLineColor, "stroke-width": thickness, "stroke-linecap": "round" }, g);
    const bands = this.options.bands;
    if (bands) {
      for (const b of bands) {
        const a0 = START + SWEEP * ((b.from - min) / (max - min || 1));
        const a1 = START + SWEEP * ((b.to - min) / (max - min || 1));
        renderer.create("path", { d: this.arc(cx, cy, r, a0, a1), fill: "none", stroke: b.color, "stroke-width": thickness, "stroke-linecap": "butt" }, g);
      }
    } else {
      renderer.create("path", { d: this.arc(cx, cy, r, START, START + SWEEP * frac), fill: "none", stroke: p.color ?? this.color, "stroke-width": thickness, "stroke-linecap": "round" }, g);
    }
    const ang = (START + SWEEP * frac) * Math.PI / 180;
    const nr = r - thickness / 2;
    const needle = renderer.create("line", {
      x1: cx,
      y1: cy,
      x2: cx + nr * Math.cos(ang),
      y2: cy + nr * Math.sin(ang),
      stroke: "#333",
      "stroke-width": 3,
      "stroke-linecap": "round",
      class: "facet-point"
    }, g);
    renderer.create("circle", { cx, cy, r: 6, fill: "#333" }, g);
    renderer.text(String(value), cx, cy + r * 0.5, { "text-anchor": "middle", ...FONTS.title, "font-size": "22px" }, g);
    if (p.name ?? this.name) {
      renderer.text(String(p.name ?? this.name), cx, cy + r * 0.5 + 18, { "text-anchor": "middle", ...FONTS.subtitle }, g);
    }
    ctx.registerHover(needle, p);
    needle.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
  }
  /** SVG arc path from startDeg to endDeg on a circle. */
  arc(cx, cy, r, a0, a1) {
    const p0 = this.pt(cx, cy, r, a0);
    const p1 = this.pt(cx, cy, r, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
  }
  pt(cx, cy, r, deg) {
    const a = deg * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
};

// src/series/waterfall.ts
var WaterfallSeries = class extends BaseSeries {
  constructor() {
    super(...arguments);
    this.colors = { up: "#26a69a", down: "#ef5350", sum: "#4472c4" };
  }
  capabilities() {
    return { grouped: false, cartesian: true, stackable: false };
  }
  /** Cumulative extent so the value axis fits every floating bar. */
  valueExtent() {
    let cum = 0, min = 0, max = 0;
    for (const p of this.points) {
      if (p.options.isSum || p.options.isIntermediateSum) {
        min = Math.min(min, cum);
        max = Math.max(max, cum);
      } else {
        const prev = cum;
        cum += p.y ?? 0;
        min = Math.min(min, prev, cum);
        max = Math.max(max, prev, cum);
      }
    }
    return [min, max];
  }
  render(ctx) {
    const { renderer, yScale } = ctx;
    const catScale = ctx.xScale;
    const g = renderer.group({ class: `facet-series facet-waterfall ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const barW = band * 0.6;
    const zeroY = yScale.scale(0);
    let cum = 0;
    let prevEndX = null;
    let prevY = zeroY;
    for (const p of this.points) {
      const isSum = !!(p.options.isSum || p.options.isIntermediateSum);
      const from = isSum ? 0 : cum;
      const to = isSum ? cum : cum + (p.y ?? 0);
      if (!isSum) cum = to;
      const cx = catScale.scale(p.x);
      const x0 = cx - barW / 2;
      const yTop = yScale.scale(Math.max(from, to));
      const yBot = yScale.scale(Math.min(from, to));
      const color = p.color ?? (isSum ? this.colors.sum : to >= from ? this.colors.up : this.colors.down);
      if (prevEndX !== null) {
        renderer.create("line", { x1: prevEndX, y1: prevY, x2: x0, y2: prevY, stroke: "#b0b0b0", "stroke-width": 1, "stroke-dasharray": "2 2" }, g);
      }
      const el = renderer.create("rect", {
        x: x0,
        y: yTop,
        width: barW,
        height: Math.max(1, yBot - yTop),
        fill: color,
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      prevEndX = x0 + barW;
      prevY = yScale.scale(to);
    }
  }
};

// src/series/histogram.ts
var HistogramSeries = class extends BaseSeries {
  constructor(options, categories) {
    super(options, categories);
    this.bins = [];
    this.bins = this.computeBins();
    this.points = this.bins.map((b, i) => ({
      x: (b.x0 + b.x1) / 2,
      y: b.count,
      index: i,
      options: { x0: b.x0, x1: b.x1, y: b.count }
    }));
  }
  capabilities() {
    return { grouped: false, cartesian: true, stackable: false };
  }
  valueExtent() {
    return [0, Math.max(1, ...this.bins.map((b) => b.count))];
  }
  computeBins() {
    const values = this.options.data.filter((v) => typeof v === "number");
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const count = this.options.bins ?? Math.max(1, Math.ceil(Math.sqrt(values.length)));
    const width = (max - min) / count || 1;
    const bins = Array.from({ length: count }, (_, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count: 0 }));
    for (const v of values) {
      const idx = Math.min(count - 1, Math.floor((v - min) / width));
      bins[idx].count++;
    }
    return bins;
  }
  render(ctx) {
    const { renderer, xScale, yScale } = ctx;
    const g = renderer.group({ class: `facet-series facet-histogram ${this.name}` }, renderer.root);
    const zeroY = yScale.scale(0);
    this.points.forEach((p) => {
      const b = { x0: p.options.x0, x1: p.options.x1 };
      const xa = xScale.scale(b.x0);
      const xb = xScale.scale(b.x1);
      const yTop = yScale.scale(p.y ?? 0);
      const el = renderer.create("rect", {
        x: Math.min(xa, xb) + 0.5,
        y: yTop,
        width: Math.max(1, Math.abs(xb - xa) - 1),
        height: Math.max(0, zeroY - yTop),
        fill: p.color ?? this.color,
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
};

// src/series/timeline.ts
var TimelineSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-timeline ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;
    const cy = plot.y + plot.height / 2;
    const pad = 40;
    const span = plot.width - pad * 2;
    const step = points.length > 1 ? span / (points.length - 1) : 0;
    renderer.create("line", { x1: plot.x + pad, y1: cy, x2: plot.x + plot.width - pad, y2: cy, stroke: THEME.axis.lineColor, "stroke-width": 2 }, g);
    points.forEach((p, i) => {
      const x = plot.x + pad + i * step;
      const above = i % 2 === 0;
      const color = p.color ?? paletteColor(colors, i);
      const stub = above ? -34 : 34;
      renderer.create("line", { x1: x, y1: cy, x2: x, y2: cy + stub, stroke: color, "stroke-width": 1.5 }, g);
      const marker = renderer.create("circle", { cx: x, cy, r: 6, fill: color, stroke: "#fff", "stroke-width": 2, class: "facet-point" }, g);
      const ty = cy + stub + (above ? -6 : 16);
      renderer.text(String(p.x ?? p.name), x, ty, { "text-anchor": "middle", ...FONTS.axisLabel, "font-weight": "600", fill: color }, g);
      const desc = p.options.name ?? p.name;
      if (desc && String(desc) !== String(p.x)) {
        renderer.text(String(desc), x, ty + (above ? -13 : 13), { "text-anchor": "middle", ...FONTS.axisLabel }, g);
      }
      ctx.registerHover(marker, p);
      marker.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      marker.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      marker.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
};

// src/series/funnel.ts
var FunnelSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false, pointLegend: true };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-funnel ${this.name}` }, renderer.root);
    const points = this.visiblePoints();
    if (!points.length) return;
    const max = Math.max(...points.map((p) => p.y ?? 0)) || 1;
    const maxW = plot.width * 0.66;
    const cx = plot.x + plot.width / 2;
    const gap = 2;
    const stageH = (plot.height - gap * (points.length - 1)) / points.length;
    const w = (v) => v / max * maxW;
    points.forEach((p, i) => {
      const yTop = plot.y + i * (stageH + gap);
      const yBot = yTop + stageH;
      const topW = w(p.y ?? 0);
      const botW = w(points[i + 1]?.y ?? p.y ?? 0);
      const color = p.color ?? paletteColor(colors, i);
      const poly = `${cx - topW / 2},${yTop} ${cx + topW / 2},${yTop} ${cx + botW / 2},${yBot} ${cx - botW / 2},${yBot}`;
      const el = renderer.create("polygon", { points: poly, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      renderer.text(`${p.name ?? p.x}: ${p.y}`, cx, (yTop + yBot) / 2, {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: "#ffffff",
        "font-weight": "600"
      }, g);
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
    });
  }
};

// src/series/treegraph.ts
var TreegraphSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-treegraph ${this.name}` }, renderer.root);
    const byId = /* @__PURE__ */ new Map();
    for (const p of this.points) {
      const id = String(p.options.id ?? p.name ?? p.x);
      byId.set(id, { point: p, id, depth: 0, y: 0, children: [] });
    }
    const roots = [];
    for (const n of byId.values()) {
      const parent = n.point.options.parent ? byId.get(String(n.point.options.parent)) : void 0;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    if (!roots.length) return;
    let leaf = 0;
    let maxDepth = 0;
    const visit = (n, depth) => {
      n.depth = depth;
      maxDepth = Math.max(maxDepth, depth);
      if (!n.children.length) {
        n.y = leaf++;
        return n.y;
      }
      const ys = n.children.map((c) => visit(c, depth + 1));
      n.y = ys.reduce((a, b) => a + b, 0) / ys.length;
      return n.y;
    };
    roots.forEach((r) => visit(r, 0));
    const leaves = Math.max(1, leaf);
    const colGap = plot.width / (maxDepth + 1);
    const rowGap = plot.height / leaves;
    const nodeX = (d) => plot.x + d * colGap + 8;
    const nodeY = (y) => plot.y + (y + 0.5) * rowGap;
    const boxW = Math.min(colGap - 24, 120);
    const boxH = Math.min(rowGap * 0.6, 26);
    for (const n of byId.values()) {
      for (const c of n.children) {
        const x1 = nodeX(n.depth) + boxW, y1 = nodeY(n.y);
        const x2 = nodeX(c.depth), y2 = nodeY(c.y);
        const mx = (x1 + x2) / 2;
        renderer.create("path", { d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, fill: "none", stroke: "#c4ccd8", "stroke-width": 1.5 }, g);
      }
    }
    let ci = 0;
    for (const n of byId.values()) {
      const x = nodeX(n.depth), y = nodeY(n.y);
      const color = n.point.color ?? paletteColor(colors, n.depth === 0 ? 0 : ci++);
      const box = renderer.group({ class: "facet-point" }, g);
      renderer.create("rect", { x, y: y - boxH / 2, width: boxW, height: boxH, rx: 5, fill: color }, box);
      renderer.text(String(n.point.name ?? n.id), x + boxW / 2, y, {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: "#ffffff",
        "font-size": "11px"
      }, box);
      ctx.registerHover(box, n.point);
      box.addEventListener("click", (e) => ctx.onPointEvent("click", n.point, e));
      box.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", n.point, e));
      box.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", n.point, e));
    }
  }
};

// src/series/bubble.ts
var BubbleSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: true, stackable: false };
  }
  render(ctx) {
    const { renderer, xScale, yScale } = ctx;
    const g = renderer.group({ class: `facet-series facet-bubble ${this.name}` }, renderer.root);
    const zs = this.points.map((p) => p.options.z ?? 1);
    const zMin = Math.min(...zs), zMax = Math.max(...zs);
    const [rMin, rMax] = this.options.sizeRange ?? [6, 34];
    const radiusFor = (z) => {
      const t = zMax === zMin ? 1 : (z - zMin) / (zMax - zMin);
      return Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
    };
    const labelData = [];
    for (const p of this.points) {
      if (p.y === void 0) continue;
      const x = xScale.scale(p.x);
      const y = yScale.scale(p.y);
      const base = p.color ?? this.color;
      const el = drawMarker(renderer, g, x, y, {
        symbol: this.options.marker?.symbol ?? "circle",
        radius: radiusFor(p.options.z ?? 1),
        fill: alpha(base, 0.55),
        stroke: base,
        strokeWidth: 1
      });
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
      el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e));
      el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      labelData.push({ pt: { x, y }, p });
    }
    drawPointLabels(renderer, g, this.options.dataLabels, this.name, labelData, this.color);
  }
};

// src/series/errorbar.ts
var ErrorBarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: true, cartesian: true, stackable: false };
  }
  pointValues(p) {
    return [p.low, p.high];
  }
  render(ctx) {
    const { renderer, groupCount, groupIndex, inverted } = ctx;
    const catScale = inverted ? ctx.yScale : ctx.xScale;
    const valScale = inverted ? ctx.xScale : ctx.yScale;
    const g = renderer.group({ class: `facet-series facet-errorbar ${this.name}` }, renderer.root);
    const band = catScale.bandwidth();
    const sub = band / groupCount;
    const cap = Math.min(sub * 0.4, 8);
    const stroke = this.color;
    for (const p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      const c = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * sub;
      const vLo = valScale.scale(p.low), vHi = valScale.scale(p.high);
      const line = (a) => renderer.create("line", { ...a, stroke, "stroke-width": 1.5, class: "facet-point" }, g);
      const el = inverted ? line({ x1: vLo, y1: c, x2: vHi, y2: c }) : line({ x1: c, y1: vLo, x2: c, y2: vHi });
      if (inverted) {
        line({ x1: vLo, y1: c - cap, x2: vLo, y2: c + cap });
        line({ x1: vHi, y1: c - cap, x2: vHi, y2: c + cap });
      } else {
        line({ x1: c - cap, y1: vLo, x2: c + cap, y2: vLo });
        line({ x1: c - cap, y1: vHi, x2: c + cap, y2: vHi });
      }
      ctx.registerHover(el, p);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
    }
  }
};

// src/series/sunburst.ts
var SunburstSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-sunburst ${this.name}` }, renderer.root);
    const byId = /* @__PURE__ */ new Map();
    for (const p of this.points) {
      const id = String(p.options.id ?? p.name ?? p.x);
      byId.set(id, { point: p, id, name: String(p.name ?? p.options.name ?? id), value: p.y ?? p.options.value ?? 0, depth: 0, children: [] });
    }
    const roots = [];
    for (const n of byId.values()) {
      const parent = n.point?.options.parent ? byId.get(String(n.point.options.parent)) : void 0;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    const root = roots.length === 1 ? roots[0] : { id: "__root", name: "", value: 0, depth: -1, children: roots };
    const rollup = (n) => {
      if (n.children.length) n.value = n.children.reduce((s, c) => s + rollup(c), 0);
      return n.value;
    };
    rollup(root);
    if (root.value <= 0) return;
    let maxDepth = 0;
    const setDepth = (n, d) => {
      n.depth = d;
      maxDepth = Math.max(maxDepth, d);
      n.children.forEach((c) => setDepth(c, d + 1));
    };
    root.children.forEach((c) => setDepth(c, 0));
    const cx = plot.x + plot.width / 2;
    const cy = plot.y + plot.height / 2;
    const R = Math.min(plot.width, plot.height) / 2 - 6;
    const ringW = R / (maxDepth + 1);
    const draw = (n, a0, a1, ci) => {
      if (n.depth >= 0) {
        const rIn = n.depth * ringW;
        const rOut = n.children.length ? (n.depth + 1) * ringW : R;
        const base = n.color ?? paletteColor(colors, ci);
        const color = n.point?.color ?? shade(base, n.depth * 0.12);
        const el = renderer.create("path", {
          d: this.arc(cx, cy, rIn, rOut, a0, a1),
          fill: color,
          stroke: "#fff",
          "stroke-width": 1,
          class: "facet-point"
        }, g);
        if (n.point) {
          ctx.registerHover(el, n.point);
          el.addEventListener("click", (e) => ctx.onPointEvent("click", n.point, e));
        }
        if (a1 - a0 > 0.18 && rOut - rIn > 14) {
          const mid = (a0 + a1) / 2, rMid = (rIn + rOut) / 2;
          renderer.text(n.name, cx + rMid * Math.cos(mid), cy + rMid * Math.sin(mid), {
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            ...FONTS.dataLabel,
            fill: "#fff",
            "font-size": "10px"
          }, g);
        }
      }
      let a = a0;
      n.children.forEach((c, i) => {
        const span = c.value / n.value * (a1 - a0);
        draw(c, a, a + span, n.depth < 0 ? i : ci);
        a += span;
      });
    };
    draw(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 0);
  }
  arc(cx, cy, rIn, rOut, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    if (rIn <= 0) {
      return `M ${cx} ${cy} L ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} Z`;
    }
    return `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)} Z`;
  }
};

// src/series/sankey.ts
var SankeySeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-sankey ${this.name}` }, renderer.root);
    const links = this.points.map((p) => ({ from: String(p.options.from ?? ""), to: String(p.options.to ?? ""), weight: p.options.weight ?? p.y ?? 1, point: p })).filter((l) => l.from && l.to);
    if (!links.length) return;
    const nodes = /* @__PURE__ */ new Map();
    const node = (id) => nodes.get(id) ?? nodes.set(id, { id, depth: 0, inflow: 0, outflow: 0, x: 0, y: 0, h: 0, color: "" }).get(id);
    for (const l of links) {
      node(l.from).outflow += l.weight;
      node(l.to).inflow += l.weight;
    }
    for (let pass = 0; pass < nodes.size; pass++) {
      let changed = false;
      for (const l of links) {
        const s = node(l.from), t = node(l.to);
        if (t.depth < s.depth + 1) {
          t.depth = s.depth + 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const maxDepth = Math.max(...[...nodes.values()].map((n) => n.depth));
    const nodeW = 14;
    const vGap = 8;
    const colWidth = maxDepth > 0 ? (plot.width - nodeW - 16) / maxDepth : 0;
    const columns = Array.from({ length: maxDepth + 1 }, () => []);
    let ci = 0;
    for (const n of nodes.values()) {
      columns[n.depth].push(n);
      n.color = paletteColor(colors, ci++);
    }
    const colValue = (col) => col.reduce((s, n) => s + Math.max(n.inflow, n.outflow), 0);
    const maxColVal = Math.max(1, ...columns.map(colValue));
    const maxColCount = Math.max(1, ...columns.map((c) => c.length));
    const unit = (plot.height - vGap * (maxColCount - 1)) / maxColVal;
    for (const col of columns) {
      const colH = col.reduce((s, n) => s + Math.max(n.inflow, n.outflow) * unit, 0) + vGap * (col.length - 1);
      let y = plot.y + (plot.height - colH) / 2;
      for (const n of col) {
        n.h = Math.max(2, Math.max(n.inflow, n.outflow) * unit);
        n.x = plot.x + n.depth * colWidth;
        n.y = y;
        y += n.h + vGap;
      }
    }
    const outOff = /* @__PURE__ */ new Map(), inOff = /* @__PURE__ */ new Map();
    for (const l of links) {
      const s = node(l.from), t = node(l.to);
      const th = Math.max(1, l.weight * unit);
      const so = outOff.get(s.id) ?? 0, to = inOff.get(t.id) ?? 0;
      const y1 = s.y + so + th / 2, y2 = t.y + to + th / 2;
      const x1 = s.x + nodeW, x2 = t.x;
      const mx = (x1 + x2) / 2;
      const path = renderer.create("path", {
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        fill: "none",
        stroke: alpha(s.color, 0.4),
        "stroke-width": th,
        class: "facet-point"
      }, g);
      ctx.registerHover(path, l.point);
      path.addEventListener("click", (e) => ctx.onPointEvent("click", l.point, e));
      outOff.set(s.id, so + th);
      inOff.set(t.id, to + th);
    }
    for (const n of nodes.values()) {
      renderer.create("rect", { x: n.x, y: n.y, width: nodeW, height: n.h, fill: n.color, rx: 2 }, g);
      const leftSide = n.depth < maxDepth / 2;
      renderer.text(n.id, leftSide ? n.x + nodeW + 4 : n.x - 4, n.y + n.h / 2, {
        "text-anchor": leftSide ? "start" : "end",
        "dominant-baseline": "middle",
        ...FONTS.axisLabel
      }, g);
    }
  }
};

// src/series/calendar.ts
var MONTHS2 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var DAY = 864e5;
var CalendarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-calendar ${this.name}` }, renderer.root);
    const days = this.points.map((p) => ({ date: new Date(p.options.date ?? p.x), value: p.options.value ?? p.y ?? 0, point: p })).filter((d) => !Number.isNaN(d.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!days.length) return;
    const values = days.map((d) => d.value);
    const min = Math.min(...values), max = Math.max(...values);
    const first = days[0].date;
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const weekIndex = (d) => Math.floor((d.getTime() - start.getTime()) / (7 * DAY));
    const topPad = 16, leftPad = 26;
    const weeks = weekIndex(days[days.length - 1].date) + 1;
    const cell = Math.min((plot.width - leftPad) / weeks, (plot.height - topPad) / 7) - 2;
    const step = cell + 2;
    const gridW = weeks * step;
    const gx = plot.x + leftPad + Math.max(0, (plot.width - leftPad - gridW) / 2);
    const gy = plot.y + topPad;
    ["", "Mon", "", "Wed", "", "Fri", ""].forEach((lbl, i) => {
      if (lbl) renderer.text(lbl, gx - 5, gy + i * step + cell / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel, "font-size": "9px" }, g);
    });
    let lastMonth = -1;
    for (const d of days) {
      const wk = weekIndex(d.date);
      const wd = d.date.getDay();
      const x = gx + wk * step, y = gy + wd * step;
      const t = max === min ? 0.5 : (d.value - min) / (max - min);
      const el = renderer.create("rect", {
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
      ctx.registerHover(el, d.point);
      el.addEventListener("click", (e) => ctx.onPointEvent("click", d.point, e));
      if (d.date.getMonth() !== lastMonth) {
        lastMonth = d.date.getMonth();
        renderer.text(MONTHS2[lastMonth], x, plot.y + 9, { "text-anchor": "start", ...FONTS.axisLabel, "font-size": "9px" }, g);
      }
    }
  }
};

// src/series/gantt.ts
var GanttSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  render(ctx) {
    const { renderer, plot, colors } = ctx;
    const g = renderer.group({ class: `facet-series facet-gantt ${this.name}` }, renderer.root);
    const tasks = this.points.map((p) => ({ name: String(p.name ?? p.x), start: p.options.start ?? p.low ?? 0, end: p.options.end ?? p.high ?? 0, point: p })).filter((t) => t.end > t.start);
    if (!tasks.length) return;
    const min = Math.min(...tasks.map((t) => t.start));
    const max = Math.max(...tasks.map((t) => t.end));
    const isTime = min > 1e11;
    const labelW = 8 + tasks.reduce((m, t) => Math.max(m, t.name.length), 0) * 6.4;
    const gx = plot.x + labelW, gw = plot.width - labelW - 8;
    const bottomPad = 22, gh = plot.height - bottomPad;
    const sx = (v) => gx + (v - min) / (max - min || 1) * gw;
    const rowH = gh / tasks.length;
    tasks.forEach((t, i) => {
      const y = plot.y + i * rowH;
      const h = Math.min(rowH * 0.6, 26);
      const bar = renderer.create("rect", {
        x: sx(t.start),
        y: y + (rowH - h) / 2,
        width: Math.max(2, sx(t.end) - sx(t.start)),
        height: h,
        rx: 4,
        fill: t.point.color ?? paletteColor(colors, i),
        class: "facet-point"
      }, g);
      ctx.registerHover(bar, t.point);
      bar.addEventListener("click", (e) => ctx.onPointEvent("click", t.point, e));
      renderer.text(t.name, gx - 6, y + rowH / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g);
    });
    const baseY = plot.y + gh;
    renderer.create("line", { x1: gx, y1: baseY, x2: gx + gw, y2: baseY, stroke: THEME.axis.lineColor }, g);
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = min + (max - min) * i / ticks;
      const x = sx(v);
      renderer.create("line", { x1: x, y1: baseY, x2: x, y2: baseY + 4, stroke: THEME.axis.lineColor }, g);
      const label = isTime ? formatDate(v, "%b %d") : String(Math.round(v));
      renderer.text(label, x, baseY + 14, { "text-anchor": "middle", ...FONTS.axisLabel }, g);
    }
  }
};

// src/series/radar.ts
var RadarSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  // Drawn by the chart-level radar renderer.
  render(_ctx) {
  }
};

// src/series/marimekko.ts
var MarimekkoSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: false, cartesian: false, stackable: false };
  }
  // Drawn by the chart-level marimekko renderer.
  render(_ctx) {
  }
};

// src/series/registry.ts
var REGISTRY = {
  bar: ColumnSeries,
  column: ColumnSeries,
  arearange: RangeSeries,
  areasplinerange: RangeSeries,
  line: LineSeries,
  spline: LineSeries,
  step: LineSeries,
  area: AreaSeries,
  areaspline: AreaSeries,
  pie: PieSeries,
  donut: PieSeries,
  scatter: ScatterSeries,
  jitter: ScatterSeries,
  boxplot: BoxplotSeries,
  dumbbell: DumbbellSeries,
  // Butterfly is laid out by the chart (back-to-back); series just hold data.
  butterfly: ColumnSeries,
  columnrange: ColumnRangeSeries,
  radialbar: RadialBarSeries,
  heatmap: HeatmapSeries,
  bullet: BulletSeries,
  candlestick: CandlestickSeries,
  gauge: GaugeSeries,
  waterfall: WaterfallSeries,
  histogram: HistogramSeries,
  timeline: TimelineSeries,
  funnel: FunnelSeries,
  treegraph: TreegraphSeries,
  bubble: BubbleSeries,
  errorbar: ErrorBarSeries,
  sunburst: SunburstSeries,
  sankey: SankeySeries,
  calendar: CalendarSeries,
  gantt: GanttSeries,
  // Radar & marimekko share a frame across series → laid out by the chart.
  radar: RadarSeries,
  marimekko: MarimekkoSeries
};
function createSeries(type, options, categories) {
  const Ctor = REGISTRY[type];
  if (!Ctor) throw new Error(`FacetViz: unknown series type "${type}"`);
  return new Ctor(options, categories);
}
function registerSeriesType(type, ctor) {
  REGISTRY[type] = ctor;
}

// src/core/chart.ts
var FacetViz = class _FacetViz {
  constructor(container, options) {
    this.events = new EventEmitter();
    this.series = [];
    /** Play the enter animation on the next render (first render + data updates). */
    this.animateNext = true;
    this.clipSeq = 0;
    /** Saved series/title/xAxis levels for drill-down navigation. */
    this.drillStack = [];
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) throw new Error("FacetViz: container element not found");
    this.container = el;
    this.options = this.resolveOptions(options);
    this.theme = resolveTheme(this.options.theme);
    this.colors = this.options.chart?.colors ?? this.options.colors ?? this.theme.colors;
    this.width = this.options.chart?.width ?? (this.container.clientWidth || 640);
    this.height = this.options.chart?.height ?? 400;
    this.build();
    this.render();
    this.setupReflow();
  }
  /** Re-render to the container's width when it resizes (unless width is fixed). */
  setupReflow() {
    if (this.options.chart?.reflow === false || this.options.chart?.width || typeof ResizeObserver === "undefined")
      return;
    let raf = 0;
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = this.container.clientWidth;
        if (w && Math.abs(w - this.width) > 1) {
          this.width = w;
          this.animateNext = false;
          this.render();
        }
      });
    });
    this.resizeObserver.observe(this.container);
  }
  // -- Option resolution -------------------------------------------------
  resolveOptions(user) {
    const merged = merge(
      {},
      DEFAULT_OPTIONS,
      user
    );
    const globalType = merged.chart?.type ?? "line";
    const plot = merged.plotOptions ?? {};
    merged.series = user.series.map((s) => {
      const type = s.type ?? globalType;
      return merge(
        {},
        plot.series ?? {},
        plot[type] ?? {},
        { type },
        s
      );
    });
    return merged;
  }
  // -- Build model -------------------------------------------------------
  build() {
    const categories = this.resolveCategories();
    this.series = this.options.series.map((opts, i) => {
      const s = createSeries(opts.type ?? "line", opts, categories);
      s.index = i;
      s.color = opts.color ?? opts.highColor ?? paletteColor(this.colors, i);
      return s;
    });
  }
  /** Category labels, from xAxis or the union of point x values. */
  resolveCategories() {
    const xAxis = this.firstAxis(this.options.xAxis);
    if (xAxis?.categories) return xAxis.categories;
    const allNumeric = this.options.series.every(
      (s) => s.data.every(
        (d) => typeof d === "number" || Array.isArray(d) && typeof d[0] === "number"
      )
    );
    if (allNumeric) return void 0;
    const seen = /* @__PURE__ */ new Set();
    const cats = [];
    for (const s of this.options.series) {
      for (const d of s.data) {
        const x = this.rawX(d);
        if (x !== void 0 && !seen.has(String(x))) {
          seen.add(String(x));
          cats.push(String(x));
        }
      }
    }
    return cats.length ? cats : void 0;
  }
  rawX(d) {
    if (d === null) return void 0;
    if (Array.isArray(d)) return d[0];
    if (typeof d === "object") {
      const o = d;
      return o.x ?? o.name;
    }
    return void 0;
  }
  firstAxis(a) {
    return Array.isArray(a) ? a[0] : a;
  }
  /** The axis options at index `i` (for secondary/dual axes). */
  axisAt(a, i) {
    if (Array.isArray(a)) return a[i] ?? {};
    return i === 0 ? a ?? {} : {};
  }
  // -- Rendering ---------------------------------------------------------
  render() {
    if (!this.renderer) {
      this.renderer = new Renderer(this.width, this.height);
      this.renderer.mount(this.container);
    } else {
      this.renderer.clear();
      this.renderer.setSize(this.width, this.height);
    }
    applyTheme(this.theme);
    this.renderer.create(
      "rect",
      {
        x: 0,
        y: 0,
        width: this.width,
        height: this.height,
        fill: this.options.chart?.backgroundColor ?? this.theme.backgroundColor
      },
      this.renderer.root
    );
    if (this.tooltip) this.tooltip.destroy();
    if (this.options.tooltip?.enabled !== false) {
      this.tooltip = new Tooltip(this.container, {
        backgroundColor: this.theme.tooltip.backgroundColor,
        borderColor: this.theme.tooltip.borderColor,
        color: this.theme.tooltip.color,
        ...this.options.tooltip
      });
    }
    const spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
    let top = spacing[0];
    top += this.renderTitles(top);
    const legendItems = this.buildLegendItems();
    const showLegend = this.options.legend?.enabled !== false && legendItems.length > 1;
    const legendPlace = this.legendPlacement();
    const legendVertical = legendPlace === "left" || legendPlace === "right";
    let legendReserveH = 0;
    let legendReserveW = 0;
    if (showLegend) {
      if (legendVertical) legendReserveW = Legend.verticalWidth(legendItems);
      else legendReserveH = LAYOUT.legendHeight;
    }
    const outer = {
      x: spacing[3] + (legendPlace === "left" ? legendReserveW : 0),
      y: top + (legendPlace === "top" ? legendReserveH : 0),
      width: this.width - spacing[1] - spacing[3] - legendReserveW,
      height: this.height - top - spacing[2] - legendReserveH
    };
    const nestedDims = this.firstAxis(this.options.xAxis)?.dimensions;
    const t = this.options.trellis;
    const chartType = this.options.chart?.type;
    const vis = () => this.series.filter((s) => s.visible && s.points.length);
    if (chartType === "butterfly") {
      this.renderButterflyPanel(outer, vis());
    } else if (chartType === "radar") {
      this.renderRadarPanel(outer, vis());
    } else if (chartType === "marimekko") {
      this.renderMarimekkoPanel(outer, vis());
    } else if (nestedDims && nestedDims.length >= 1) {
      this.renderNestedPanel(
        outer,
        this.series.filter((s) => s.visible && s.points.length),
        nestedDims
      );
    } else if (t && (t.columns || t.rows) && t.table !== false) {
      this.renderTrellisTable(outer, t);
    } else {
      const panels = this.computePanels(outer);
      for (const panel of panels) this.renderPanel(panel);
    }
    if (showLegend) {
      let lx = outer.x;
      let ly = this.height - spacing[2] - LAYOUT.legendHeight + 12;
      let lw = outer.width;
      let lh = LAYOUT.legendHeight;
      if (legendPlace === "top") {
        ly = top + 12;
      } else if (legendPlace === "left") {
        lx = spacing[3];
        ly = outer.y;
        lw = legendReserveW;
        lh = outer.height;
      } else if (legendPlace === "right") {
        lx = outer.x + outer.width + 8;
        ly = outer.y;
        lw = legendReserveW;
        lh = outer.height;
      }
      new Legend({
        renderer: this.renderer,
        items: legendItems,
        options: this.options.legend ?? {},
        x: lx,
        y: ly,
        width: lw,
        height: lh,
        layout: legendVertical ? "vertical" : "horizontal",
        onToggle: (i) => this.toggleSeries(i)
      }).render(this.renderer.group({}, this.renderer.root));
    }
    this.applyAccessibility();
    this.installZoom(outer);
    this.drawDrillUp(outer);
    if (this.animateNext) this.animateEnter();
    this.animateNext = false;
    this.events.emit("render", this);
    this.options.chart?.events?.render?.(this);
  }
  /** Set root ARIA role + a <title>/<desc> for screen readers. */
  applyAccessibility() {
    if (this.options.accessibility?.enabled === false) return;
    const root = this.renderer.root;
    const label = this.options.accessibility?.description ?? this.options.title?.text ?? `${this.options.chart?.type ?? "chart"} chart with ${this.series.length} series`;
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", label);
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title"
    );
    title.textContent = label;
    root.insertBefore(title, root.firstChild);
  }
  /** Enter animation: bars grow from the baseline, lines draw in, the rest fade. */
  animateEnter() {
    const opt = this.options.chart?.animation;
    if (opt === false) return;
    const cfg = typeof opt === "object" ? opt : {};
    if (cfg.enabled === false || typeof Element.prototype.animate !== "function")
      return;
    const duration = cfg.duration ?? 600;
    const easing = cfg.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";
    const inverted = this.isInverted(this.series);
    const groups = this.renderer.root.querySelectorAll(".facet-series");
    groups.forEach((g, gi) => {
      const delay = Math.min(gi * 60, 240);
      const cls = g.getAttribute("class") ?? "";
      if (cls.includes("facet-column") || cls.includes("facet-marimekko")) {
        g.querySelectorAll("rect.facet-point, rect").forEach(
          (r) => {
            r.style.transformBox = "fill-box";
            r.style.transformOrigin = inverted ? "left center" : "center bottom";
            r.animate(
              [
                { transform: inverted ? "scaleX(0)" : "scaleY(0)" },
                { transform: "none" }
              ],
              { duration, easing, delay, fill: "backwards" }
            );
          }
        );
      } else if (cls.includes("facet-line") || cls.includes("facet-arearange") || cls.includes("facet-radar")) {
        g.querySelectorAll("path").forEach((p) => {
          if (p.getAttribute("fill") !== "none") {
            p.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration,
              easing,
              delay,
              fill: "backwards"
            });
            return;
          }
          const len = p.getTotalLength?.() ?? 0;
          if (!len) return;
          p.style.strokeDasharray = `${len}`;
          const anim = p.animate(
            [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
            { duration: duration + 200, easing, delay, fill: "backwards" }
          );
          anim.onfinish = () => {
            p.style.strokeDasharray = "";
          };
        });
      } else {
        g.animate(
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "none" }
          ],
          { duration, easing, delay, fill: "backwards" }
        );
      }
    });
  }
  /** Convert a client X coordinate to the SVG's internal x (accounts for CSS scaling). */
  localX(clientX) {
    const r = this.renderer.root.getBoundingClientRect();
    return r.width ? (clientX - r.left) * (this.width / r.width) : clientX;
  }
  localY(clientY) {
    const r = this.renderer.root.getBoundingClientRect();
    return r.height ? (clientY - r.top) * (this.height / r.height) : clientY;
  }
  /**
   * Drag-select on a numeric/datetime x-axis to zoom. Sets the x-axis min/max
   * and re-renders; a "Reset zoom" control restores the full range.
   */
  installZoom(outer) {
    const z = this.options.chart?.zoom;
    const type = typeof z === "object" ? z.type : z;
    if (!type) return;
    const st = this.zoomState;
    if (!st) return;
    const xScale = st.xScale;
    const yScale = st.yScale;
    const canX = (type === "x" || type === "xy") && !!xScale?.invert && xScale.bandwidth() === 0;
    const canY = (type === "y" || type === "xy") && !!yScale?.invert && yScale.bandwidth() === 0;
    if (!canX && !canY) return;
    const plot = st.plot;
    const root = this.renderer.root;
    const overlay = this.renderer.create(
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
    );
    const clampX = (v) => Math.max(plot.x, Math.min(plot.x + plot.width, v));
    const clampY = (v) => Math.max(plot.y, Math.min(plot.y + plot.height, v));
    let startX = 0, startY = 0;
    let band = null;
    const bandRect = (x, y) => ({
      x: canX ? Math.min(startX, x) : plot.x,
      width: canX ? Math.abs(x - startX) : plot.width,
      y: canY ? Math.min(startY, y) : plot.y,
      height: canY ? Math.abs(y - startY) : plot.height
    });
    overlay.addEventListener("mousedown", (e) => {
      startX = clampX(this.localX(e.clientX));
      startY = clampY(this.localY(e.clientY));
      band = this.renderer.create(
        "rect",
        {
          ...bandRect(startX, startY),
          fill: "rgba(37,99,235,0.15)",
          stroke: "rgba(37,99,235,0.6)"
        },
        root
      );
      const move = (ev) => {
        const r = bandRect(
          clampX(this.localX(ev.clientX)),
          clampY(this.localY(ev.clientY))
        );
        band.setAttribute("x", String(r.x));
        band.setAttribute("width", String(r.width));
        band.setAttribute("y", String(r.y));
        band.setAttribute("height", String(r.height));
      };
      const up = (ev) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        const endX = clampX(this.localX(ev.clientX)), endY = clampY(this.localY(ev.clientY));
        band?.remove();
        band = null;
        const dragX = canX && Math.abs(endX - startX) >= 6;
        const dragY = canY && Math.abs(endY - startY) >= 6;
        if (!dragX && !dragY) return;
        if (dragX) {
          const a = xScale.invert(Math.min(startX, endX)), b = xScale.invert(Math.max(startX, endX));
          this.setAxisRange("xAxis", a, b);
        }
        if (dragY) {
          const a = yScale.invert(Math.max(startY, endY)), b = yScale.invert(Math.min(startY, endY));
          this.setAxisRange("yAxis", a, b);
        }
        this.animateNext = false;
        this.render();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
    const xa = this.axisAt(this.options.xAxis, 0);
    const ya = this.axisAt(this.options.yAxis, 0);
    const zoomed = xa.min !== void 0 || xa.max !== void 0 || ya.min !== void 0 || ya.max !== void 0;
    if (zoomed) {
      const g = this.renderer.group(
        { class: "facet-zoom-reset", style: "cursor:pointer" },
        root
      );
      const bx = outer.x + outer.width - 92, by = outer.y + 2;
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
      );
      this.renderer.text(
        "\u27F2 Reset zoom",
        bx + 45,
        by + 15,
        {
          "text-anchor": "middle",
          ...FONTS.axisLabel,
          fill: this.theme.axis.labelColor
        },
        g
      );
      g.addEventListener("click", () => {
        this.clearAxisRange("xAxis");
        this.clearAxisRange("yAxis");
        this.animateNext = true;
        this.render();
      });
    }
  }
  /** Set an axis' min/max (single-axis only; leaves multi-axis configs alone). */
  setAxisRange(axis, min, max) {
    const cur = this.options[axis];
    if (Array.isArray(cur)) return;
    this.options[axis] = { ...cur ?? {}, min, max };
  }
  /** Remove min/max from a single-axis config (used by "Reset zoom"). */
  clearAxisRange(axis) {
    const cur = this.options[axis];
    if (Array.isArray(cur) || !cur) return;
    const { min, max, ...rest } = cur;
    this.options[axis] = rest;
  }
  renderTitles(top) {
    let used = 0;
    const title = this.options.title;
    if (title?.text) {
      const x = this.titleX(title.align);
      this.renderer.text(
        title.text,
        x,
        top + 20,
        {
          "text-anchor": this.anchor(title.align),
          ...FONTS.title,
          ...title.style ?? {}
        },
        this.renderer.root
      );
      used += LAYOUT.titleHeight;
    }
    const sub = this.options.subtitle;
    if (sub?.text) {
      const x = this.titleX(sub.align);
      this.renderer.text(
        sub.text,
        x,
        top + used + 16,
        {
          "text-anchor": this.anchor(sub.align),
          ...FONTS.subtitle
        },
        this.renderer.root
      );
      used += LAYOUT.subtitleHeight;
    }
    return used;
  }
  titleX(align) {
    const spacing = this.options.chart?.spacing ?? [16, 16, 16, 16];
    if (align === "left") return spacing[3];
    if (align === "right") return this.width - spacing[1];
    return this.width / 2;
  }
  anchor(align) {
    return align === "left" ? "start" : align === "right" ? "end" : "middle";
  }
  // -- Panels (trellis) --------------------------------------------------
  computePanels(outer) {
    const t = this.options.trellis;
    const colDim = t?.columns;
    const rowDim = t?.rows;
    if (!colDim && !rowDim) {
      return [{ rect: outer, series: this.series, title: void 0 }];
    }
    const colVals = colDim ? this.dimensionValues(colDim) : [void 0];
    const rowVals = rowDim ? this.dimensionValues(rowDim) : [void 0];
    const gap = t?.gap ?? 24;
    const pw = (outer.width - gap * (colVals.length - 1)) / colVals.length;
    const ph = (outer.height - gap * (rowVals.length - 1)) / rowVals.length;
    const panels = [];
    rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        const rect = {
          x: outer.x + ci * (pw + gap),
          y: outer.y + ri * (ph + gap),
          width: pw,
          height: ph
        };
        const series = this.series.map(
          (s) => s.filterByDimensions({ [colDim ?? ""]: cv, [rowDim ?? ""]: rv })
        );
        const title = [cv, rv].filter((v) => v !== void 0).join(" \xB7 ");
        panels.push({ rect, series, title });
      });
    });
    return panels;
  }
  dimensionValues(dim) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const s of this.series) {
      for (const p of s.points) {
        const v = p.options[dim];
        if (v !== void 0 && !seen.has(String(v))) {
          seen.add(String(v));
          out.push(v);
        }
      }
    }
    return out;
  }
  /** Estimated px width of the widest category-axis label. */
  catLabelWidth(visible) {
    const cats = this.currentCategories(visible) ?? [];
    return cats.reduce((m, c) => Math.max(m, String(c).length), 0) * 6.6;
  }
  /** Estimated px width of the widest value-axis label. */
  valueLabelWidth(visible, valOpts) {
    const [dmin, dmax] = this.valueDomain(visible);
    const fmt = (v) => {
      if (valOpts.labels?.formatter) return String(valOpts.labels.formatter(v));
      const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
      return String(r);
    };
    return Math.max(
      fmt(dmin).length,
      fmt(dmax).length,
      fmt((dmin + dmax) / 2).length
    ) * 6.6;
  }
  /** Space to reserve for an axis on a given side (vertical → width, else height). */
  axisReserve(opts, side, labelW) {
    if (opts.visible === false) return 6;
    const title = opts.title?.text ? 1 : 0;
    if (side === "left" || side === "right") {
      return Math.max(
        LAYOUT.defaultLeftAxisWidth,
        LAYOUT.tickLength + 8 + labelW + (title ? 18 : 0)
      );
    }
    const rot = opts.labels?.rotation ?? 0;
    const rotExtra = rot ? Math.abs(Math.sin(rot * Math.PI / 180)) * labelW : 0;
    return LAYOUT.defaultBottomAxisHeight + (title ? 24 : 0) + rotExtra;
  }
  renderPanel(panel) {
    const visible = panel.series.filter((s) => s.visible && s.points.length);
    if (!visible.length) return;
    const cartesian = visible.some((s) => s.capabilities().cartesian);
    const inverted = this.isInverted(visible);
    let plot = panel.rect;
    if (panel.title) {
      this.renderer.text(
        panel.title,
        plot.x + plot.width / 2,
        plot.y + 12,
        {
          "text-anchor": "middle",
          ...FONTS.subtitle,
          "font-weight": "600"
        },
        this.renderer.root
      );
      plot = { ...plot, y: plot.y + 20, height: plot.height - 20 };
    }
    if (!cartesian) {
      this.renderPolarPanel(plot, visible);
      return;
    }
    const catOpts = this.firstAxis(this.options.xAxis) ?? {};
    const valOpts = this.firstAxis(this.options.yAxis) ?? {};
    const catSide = inverted ? catOpts.opposite ? "right" : "left" : catOpts.opposite ? "top" : "bottom";
    const valSide = inverted ? valOpts.opposite ? "top" : "bottom" : valOpts.opposite ? "right" : "left";
    const catReserve = this.axisReserve(
      catOpts,
      catSide,
      this.catLabelWidth(visible)
    );
    const valReserve = this.axisReserve(
      valOpts,
      valSide,
      this.valueLabelWidth(visible, valOpts)
    );
    const pad = { left: 8, right: 8, top: 6, bottom: 6 };
    pad[catSide] = catReserve;
    pad[valSide] = valReserve;
    const axisPlot = {
      x: plot.x + pad.left,
      y: plot.y + pad.top,
      width: plot.width - pad.left - pad.right,
      height: plot.height - pad.top - pad.bottom
    };
    this.computeStacks(visible);
    const { xScale, yScale } = this.buildScales(visible, axisPlot, inverted);
    const group = this.groupInfo(visible);
    const catScale = inverted ? yScale : xScale;
    const valScale = inverted ? xScale : yScale;
    const axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    );
    new Axis({
      renderer: this.renderer,
      scale: catScale,
      position: catSide,
      plot: axisPlot,
      options: catOpts,
      grid: false
    }).render(axisLayer);
    new Axis({
      renderer: this.renderer,
      scale: valScale,
      position: valSide,
      plot: axisPlot,
      options: valOpts,
      grid: true
    }).render(axisLayer);
    this.plotCtx = { plot: axisPlot, xScale, yScale, inverted };
    this.zoomState = !inverted ? { plot: axisPlot, xScale, yScale } : void 0;
    const boost = !inverted && this.boostEnabled(visible);
    const cctx = boost ? this.createBoostCanvas(axisPlot) : null;
    const hits = [];
    const existing = new Set(this.renderer.root.children);
    for (const s of visible) {
      if (cctx && this.isBoostable(s)) {
        this.drawBoostSeries(s, cctx, xScale, yScale, hits);
      } else {
        const ctx = this.seriesContext(
          s,
          axisPlot,
          xScale,
          yScale,
          group,
          inverted,
          false
        );
        s.render(ctx);
      }
    }
    this.clipToPlot(axisPlot, existing);
    if (cctx) this.installBoostHover(axisPlot, hits);
  }
  /** Clip the series groups added since `existing` was captured to the plot rect. */
  clipToPlot(plot, existing) {
    const NS = "http://www.w3.org/2000/svg";
    const root = this.renderer.root;
    let defs = root.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(NS, "defs");
      root.insertBefore(defs, root.firstChild);
    }
    const id = `facet-clip-${++this.clipSeq}`;
    const cp = document.createElementNS(NS, "clipPath");
    cp.setAttribute("id", id);
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(plot.x - 2));
    rect.setAttribute("y", String(plot.y - 2));
    rect.setAttribute("width", String(plot.width + 4));
    rect.setAttribute("height", String(plot.height + 4));
    cp.appendChild(rect);
    defs.appendChild(cp);
    for (const el of Array.from(root.children)) {
      if (existing.has(el)) continue;
      const cls = el.getAttribute("class") ?? "";
      if (cls.includes("facet-series") || cls.includes("facet-boost"))
        el.setAttribute("clip-path", `url(#${id})`);
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
    return _FacetViz.BOOSTABLE.has(s.type);
  }
  boostEnabled(visible) {
    const b = this.options.chart?.boost;
    if (b === false) return false;
    const enabled = typeof b === "object" ? b.enabled : b;
    if (enabled) return true;
    const threshold = typeof b === "object" && b.threshold || 1500;
    return visible.some(
      (s) => this.isBoostable(s) && s.points.length > threshold
    );
  }
  /** A canvas overlay sized to the plot, drawing in the SVG coordinate system. */
  createBoostCanvas(plot) {
    const fo = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "foreignObject"
    );
    fo.setAttribute("x", String(plot.x));
    fo.setAttribute("y", String(plot.y));
    fo.setAttribute("width", String(plot.width));
    fo.setAttribute("height", String(plot.height));
    fo.setAttribute("class", "facet-boost");
    const canvas = document.createElement("canvas");
    const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(plot.width * dpr));
    canvas.height = Math.max(1, Math.round(plot.height * dpr));
    canvas.style.width = `${plot.width}px`;
    canvas.style.height = `${plot.height}px`;
    fo.appendChild(canvas);
    this.renderer.root.appendChild(fo);
    let c = null;
    try {
      c = canvas.getContext("2d");
    } catch {
      c = null;
    }
    if (!c) {
      fo.remove();
      return null;
    }
    c.scale(dpr, dpr);
    c.translate(-plot.x, -plot.y);
    return c;
  }
  drawBoostSeries(s, c, xScale, yScale, hits) {
    const color = s.color;
    if (["line", "spline", "step", "area", "areaspline"].includes(s.type)) {
      const raw = s.points.filter((p) => p.y !== void 0).map((p) => ({
        x: xScale.scale(p.x),
        y: yScale.scale(p.y),
        point: p
      }));
      const pts = decimateLine(raw);
      c.beginPath();
      pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.strokeStyle = color;
      c.lineWidth = s.options.lineWidth ?? 2;
      c.lineJoin = "round";
      c.stroke();
      if (s.type.startsWith("area")) {
        const zeroY = yScale.scale(0);
        c.lineTo(pts[pts.length - 1].x, zeroY);
        c.lineTo(pts[0].x, zeroY);
        c.closePath();
        c.fillStyle = alpha(color, 0.25);
        c.fill();
      }
      for (const p of raw)
        hits.push({ x: p.x, y: p.y, point: p.point, series: s });
    } else {
      const zs = s.type === "bubble" ? s.points.map((p) => p.options.z ?? 1) : [];
      const zMin = zs.length ? Math.min(...zs) : 0, zMax = zs.length ? Math.max(...zs) : 1;
      const [rMin, rMax] = s.options.sizeRange ?? [3, 22];
      c.fillStyle = alpha(color, 0.6);
      for (const p of s.points) {
        if (p.y === void 0) continue;
        const px = xScale.scale(p.x), py = yScale.scale(p.y);
        let r = s.options.marker?.radius ?? 3;
        if (s.type === "bubble") {
          const t = zMax === zMin ? 1 : ((p.options.z ?? 1) - zMin) / (zMax - zMin);
          r = Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
        }
        c.beginPath();
        c.arc(px, py, r, 0, Math.PI * 2);
        c.fill();
        hits.push({ x: px, y: py, point: p, series: s });
      }
    }
  }
  /** Nearest-point hover for boosted series (no per-point DOM nodes). */
  installBoostHover(plot, hits) {
    if (!this.tooltip || !hits.length) return;
    let marker;
    const root = this.renderer.root;
    const onMove = (e) => {
      const mx = this.localX(e.clientX), my = this.localY(e.clientY);
      if (mx < plot.x || mx > plot.x + plot.width || my < plot.y || my > plot.y + plot.height)
        return;
      let best = null, bd = 400;
      for (const h of hits) {
        const dx = h.x - mx, dy = h.y - my, d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      marker?.remove();
      marker = void 0;
      if (!best) {
        this.tooltip.hide();
        return;
      }
      marker = this.renderer.create(
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
      const p = best.point, s = best.series;
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
      );
      this.tooltip.move(e.clientX, e.clientY);
    };
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", () => {
      marker?.remove();
      marker = void 0;
      this.tooltip.hide();
    });
  }
  /**
   * Cross-tab trellis table. All cells share one y-scale and one x-scale;
   * the y-axis is labelled only on the leftmost column and the x-axis only on
   * the bottom row. Dimension values become column headers (top) and row
   * headers (right), with the dimension name shown once.
   */
  renderTrellisTable(outer, t) {
    const colDim = t.columns;
    const rowDim = t.rows;
    const colVals = colDim ? this.dimensionValues(colDim) : [void 0];
    const rowVals = rowDim ? this.dimensionValues(rowDim) : [void 0];
    const gap = t.gap ?? 0;
    const allVisible = this.series.filter((s) => s.visible && s.points.length);
    const categories = this.currentCategories(allVisible);
    const xOpts = this.firstAxis(this.options.xAxis) ?? {};
    const yOpts = this.firstAxis(this.options.yAxis) ?? {};
    let [vMin, vMax] = this.valueDomain(allVisible);
    if (allVisible.some(
      (s) => ["column", "bar", "area", "areaspline"].includes(s.type)
    )) {
      vMin = Math.min(vMin, 0);
      vMax = Math.max(vMax, 0);
    }
    if (yOpts.max === void 0) {
      const span = vMax - vMin || Math.abs(vMax) || 1;
      vMax += span * 0.08;
    }
    const dimNameRowH = 16;
    const rowValueColW = rowDim ? Math.max(
      32,
      Math.max(
        rowDim.length,
        ...rowVals.filter((v) => v !== void 0).map((v) => String(v).length),
        0
      ) * 6.6 + 4
    ) : 0;
    const tickLabelW = LAYOUT.tickLength + 8 + this.valueLabelWidth(allVisible, yOpts);
    const colHeaderH = colDim ? dimNameRowH + 20 : rowDim ? dimNameRowH : 0;
    const rowHeaderW = rowDim ? rowValueColW : 0;
    const leftReserve = rowHeaderW + tickLabelW;
    const bottomReserve = LAYOUT.defaultBottomAxisHeight;
    const gridX = outer.x + leftReserve;
    const gridY = outer.y + colHeaderH;
    const gridW = outer.width - leftReserve;
    const gridH = outer.height - colHeaderH - bottomReserve;
    const cellW = (gridW - gap * (colVals.length - 1)) / colVals.length;
    const cellH = (gridH - gap * (rowVals.length - 1)) / rowVals.length;
    const lineColor = THEME.axis.lineColor;
    const headerLayer = this.renderer.group(
      { class: "facet-trellis-headers" },
      this.renderer.root
    );
    const dividerBottom = gridY + gridH + LAYOUT.tickLength + 12;
    if (colDim) {
      this.renderer.text(
        colDim,
        gridX + gridW / 2,
        outer.y + dimNameRowH / 2 + 4,
        {
          "text-anchor": "middle",
          ...FONTS.axisTitle
        },
        headerLayer
      );
      colVals.forEach((cv, ci) => {
        if (cv === void 0) return;
        const cx = gridX + ci * (cellW + gap) + cellW / 2;
        this.renderer.text(
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
        );
        if (ci > 0) {
          const dx = gridX + ci * (cellW + gap) - gap / 2;
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
      });
    }
    if (rowDim) {
      const rowDimNameY = colDim ? outer.y + dimNameRowH + 17 : outer.y + colHeaderH / 2 + 4;
      this.renderer.text(
        rowDim,
        outer.x + rowHeaderW / 2,
        rowDimNameY,
        {
          "text-anchor": "middle",
          ...FONTS.axisTitle
        },
        headerLayer
      );
      rowVals.forEach((rv, ri) => {
        if (rv === void 0) return;
        const cy = gridY + ri * (cellH + gap) + cellH / 2 + 4;
        this.renderer.text(
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
        );
        if (ri > 0) {
          const dy = gridY + ri * (cellH + gap) - gap / 2;
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
      });
      this.renderer.create(
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
      );
      this.renderer.create(
        "line",
        {
          x1: outer.width + 10,
          //outer.x + rowHeaderW,
          y1: outer.y,
          x2: outer.width + 10,
          // outer.x + rowHeaderW,
          y2: dividerBottom,
          // gridY,
          stroke: lineColor,
          "stroke-width": 1
        },
        headerLayer
      );
    }
    if (colHeaderH) {
      this.renderer.create(
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
      );
    }
    rowVals.forEach((rv, ri) => {
      colVals.forEach((cv, ci) => {
        const cell = {
          x: gridX + ci * (cellW + gap),
          y: gridY + ri * (cellH + gap),
          width: cellW,
          height: cellH
        };
        const filter = {};
        if (colDim) filter[colDim] = cv;
        if (rowDim) filter[rowDim] = rv;
        const cellSeries = this.series.map((s) => s.filterByDimensions(filter)).filter((s) => s.visible && s.points.length);
        const xScale = categories ? new CategoryScale({
          categories,
          range: [cell.x, cell.x + cell.width]
        }) : new LinearScale({
          domain: this.xNumericDomain(
            cellSeries.length ? cellSeries : allVisible
          ),
          range: [cell.x, cell.x + cell.width]
        });
        let yScale = this.valueScale(
          yOpts,
          [vMin, vMax],
          [cell.y + cell.height, cell.y]
        );
        if (yScale instanceof LinearScale) {
          const allTicks = yScale.ticks();
          if (allTicks.length > 1) {
            yScale = new LinearScale({
              domain: yScale.domain,
              range: [cell.y + cell.height, cell.y],
              ticks: allTicks.slice(0, -1)
            });
          }
        }
        const axisLayer = this.renderer.group(
          { class: "facet-axes" },
          this.renderer.root
        );
        const isLeft = ci === 0;
        const isBottom = ri === rowVals.length - 1;
        new Axis({
          renderer: this.renderer,
          scale: yScale,
          position: "left",
          plot: cell,
          grid: true,
          options: isLeft ? { ...yOpts, title: void 0 } : { labels: { enabled: false }, lineWidth: 0 }
        }).render(axisLayer);
        new Axis({
          renderer: this.renderer,
          scale: xScale,
          position: "bottom",
          plot: cell,
          grid: false,
          options: isBottom ? { ...xOpts, title: void 0, ticks: false } : { labels: { enabled: false }, lineWidth: 0, ticks: false }
        }).render(axisLayer);
        if (!cellSeries.length) return;
        this.computeStacks(cellSeries);
        const group = this.groupInfo(cellSeries);
        for (const s of cellSeries) {
          const ctx = this.seriesContext(
            s,
            cell,
            xScale,
            yScale,
            group,
            false,
            false
          );
          s.render(ctx);
        }
      });
    });
  }
  renderPolarPanel(plot, visible) {
    const dummy = new LinearScale({ domain: [0, 1], range: [0, 1] });
    for (const s of visible) {
      const ctx = this.seriesContext(
        s,
        plot,
        dummy,
        dummy,
        { count: 1, index: /* @__PURE__ */ new Map() },
        false,
        true
      );
      s.render(ctx);
    }
  }
  // -- Nested (hierarchical x-axis) ------------------------------
  renderNestedPanel(outer, visible, dims) {
    if (!visible.length) return;
    const agg = this.firstAxis(this.options.xAxis)?.aggregate ?? "sum";
    const { leaves, keys, seriesPoints } = this.buildNested(visible, dims, agg);
    if (!keys.length) return;
    const aggSeries = visible.map(
      (s) => s.withPoints(seriesPoints.get(s.index) ?? [])
    );
    const yOpts0 = this.axisAt(this.options.yAxis, 0);
    const yOpts1 = this.axisAt(this.options.yAxis, 1);
    const onAxis = (s, i) => (s.options.yAxis ?? 0) === i;
    const secondary = aggSeries.filter((s) => onAxis(s, 1));
    const hasSecondary = secondary.length > 0;
    const xOpts = this.firstAxis(this.options.xAxis) ?? {};
    const split = !!xOpts.opposite;
    const rowH = 18;
    const leftReserve = LAYOUT.tickLength + 8 + this.valueLabelWidth(
      aggSeries.filter((s) => onAxis(s, 0)),
      yOpts0
    ) + (yOpts0.title?.text ? 18 : 0);
    const rightReserve = hasSecondary ? LAYOUT.tickLength + 8 + this.valueLabelWidth(secondary, yOpts1) + (yOpts1.title?.text ? 18 : 0) : 8;
    const bottomReserve = LAYOUT.tickLength + (split ? 1 : dims.length) * rowH + 12;
    const topReserve = split ? LAYOUT.tickLength + (dims.length - 1) * rowH + 8 : 6;
    const plot = {
      x: outer.x + leftReserve,
      y: outer.y + topReserve,
      width: outer.width - leftReserve - rightReserve,
      height: outer.height - topReserve - bottomReserve
    };
    const xScale = new CategoryScale({
      categories: keys,
      range: [plot.x, plot.x + plot.width]
    });
    const range = [plot.y + plot.height, plot.y];
    const scaleFor = (list, opts) => {
      let [lo, hi] = this.valueDomain(list.length ? list : aggSeries);
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
      return this.valueScale(opts, [lo, hi], range);
    };
    const yScale0 = scaleFor(
      aggSeries.filter((s) => onAxis(s, 0)),
      yOpts0
    );
    const yScale1 = hasSecondary ? scaleFor(secondary, yOpts1) : yScale0;
    const axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    );
    new Axis({
      renderer: this.renderer,
      scale: yScale0,
      position: "left",
      plot,
      options: yOpts0,
      grid: true
    }).render(axisLayer);
    if (hasSecondary) {
      new Axis({
        renderer: this.renderer,
        scale: yScale1,
        position: "right",
        plot,
        options: yOpts1,
        grid: false
      }).render(axisLayer);
    }
    new NestedAxis({
      renderer: this.renderer,
      scale: xScale,
      plot,
      leaves,
      keys,
      position: split ? "split" : "bottom"
    }).render(axisLayer);
    const group = this.groupInfo(aggSeries);
    const lineFamily = /* @__PURE__ */ new Set([
      "line",
      "spline",
      "step",
      "area",
      "areaspline"
    ]);
    for (const s of aggSeries) {
      const yScale = onAxis(s, 1) ? yScale1 : yScale0;
      const ctx = this.seriesContext(
        s,
        plot,
        xScale,
        yScale,
        group,
        false,
        false
      );
      if (lineFamily.has(s.type)) {
        let segStart = 0;
        for (let i = 1; i <= s.points.length; i++) {
          const boundary = i === s.points.length || leaves[s.points[i].index][0] !== leaves[s.points[segStart].index][0];
          if (boundary) {
            s.withPoints(s.points.slice(segStart, i)).render(ctx);
            segStart = i;
          }
        }
      } else {
        s.render(ctx);
      }
    }
  }
  // -- Butterfly (tornado) ----------------------------------------------
  /**
   * Two series drawn back-to-back around a central category axis: the first
   * grows leftward, the second rightward, sharing one value scale so the halves
   * are directly comparable (population pyramids, before/after tornadoes).
   */
  renderButterflyPanel(outer, visible) {
    const pair = visible.slice(0, 2);
    if (pair.length < 2) {
      const panels = this.computePanels(outer);
      for (const p of panels) this.renderPanel(p);
      return;
    }
    const [leftS, rightS] = pair;
    const categories = this.currentCategories(pair) ?? [];
    const yOpts = this.firstAxis(this.options.yAxis) ?? {};
    let maxVal = 0;
    for (const s of pair)
      for (const p of s.points) maxVal = Math.max(maxVal, p.y ?? 0);
    maxVal = yOpts.max ?? (maxVal || 1);
    const bottomReserve = LAYOUT.defaultBottomAxisHeight;
    const gutter = 84;
    const plot = {
      x: outer.x,
      y: outer.y + 6,
      width: outer.width,
      height: outer.height - bottomReserve - 6
    };
    const halfW = (plot.width - gutter) / 2;
    const leftZeroX = plot.x + halfW;
    const rightZeroX = plot.x + halfW + gutter;
    const centerX = (leftZeroX + rightZeroX) / 2;
    const catScale = new CategoryScale({
      categories,
      range: [plot.y, plot.y + plot.height]
    });
    const leftVal = new LinearScale({
      domain: [0, maxVal],
      range: [leftZeroX, plot.x]
    });
    const rightVal = new LinearScale({
      domain: [0, maxVal],
      range: [rightZeroX, plot.x + plot.width]
    });
    const axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    );
    new Axis({
      renderer: this.renderer,
      scale: leftVal,
      position: "bottom",
      grid: false,
      plot: { x: plot.x, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: void 0 }
    }).render(axisLayer);
    new Axis({
      renderer: this.renderer,
      scale: rightVal,
      position: "bottom",
      grid: false,
      plot: { x: rightZeroX, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: void 0 }
    }).render(axisLayer);
    const band = catScale.bandwidth();
    for (const cat of categories) {
      const cy = catScale.scale(cat) + 4;
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
    );
    this.renderer.text(
      rightS.name,
      rightZeroX + halfW / 2,
      outer.y + outer.height - 4,
      { "text-anchor": "middle", ...FONTS.axisTitle },
      axisLayer
    );
    this.drawButterflySide(leftS, catScale, leftVal, leftZeroX, band, "left");
    this.drawButterflySide(
      rightS,
      catScale,
      rightVal,
      rightZeroX,
      band,
      "right"
    );
  }
  drawButterflySide(s, catScale, valScale, zeroX, band, side) {
    const g = this.renderer.group(
      { class: `facet-series facet-butterfly ${s.name}` },
      this.renderer.root
    );
    const barH = band * 0.8;
    for (const p of s.points) {
      if (p.y === void 0) continue;
      const vx = valScale.scale(p.y);
      const rect = {
        x: Math.min(zeroX, vx),
        y: catScale.scale(p.x) - barH / 2,
        width: Math.max(1, Math.abs(vx - zeroX)),
        height: barH
      };
      const el = this.renderer.create(
        "rect",
        { ...rect, fill: p.color ?? s.color, class: "facet-point" },
        g
      );
      this.bindTooltip(el, s, p);
      el.addEventListener(
        "click",
        (e) => this.handlePointEvent("click", s, p, e)
      );
      el.addEventListener(
        "mouseover",
        (e) => this.handlePointEvent("mouseOver", s, p, e)
      );
      el.addEventListener(
        "mouseout",
        (e) => this.handlePointEvent("mouseOut", s, p, e)
      );
      const dl = s.options.dataLabels;
      if (dl?.enabled) {
        const text = labelString(dl, {
          x: p.x,
          y: p.y,
          point: p.options,
          series: s.name
        });
        const outside = (dl.position ?? "outside") !== "inside";
        const lx = side === "left" ? outside ? rect.x - 4 : rect.x + 4 : outside ? rect.x + rect.width + 4 : rect.x + rect.width - 4;
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
    const cats = this.currentCategories(visible) ?? [];
    const n = cats.length;
    if (n < 3) return;
    const cx = outer.x + outer.width / 2;
    const cy = outer.y + outer.height / 2 + 4;
    const R = Math.min(outer.width, outer.height) / 2 - 34;
    const [, vMaxRaw] = this.valueDomain(visible);
    const vMax = Math.max(vMaxRaw, 0) || 1;
    const angle = (i) => -Math.PI / 2 + i / n * Math.PI * 2;
    const pt = (i, v) => ({
      x: cx + v / vMax * R * Math.cos(angle(i)),
      y: cy + v / vMax * R * Math.sin(angle(i))
    });
    const grid = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    );
    for (let r = 1; r <= 4; r++) {
      const ring = cats.map((_, i) => {
        const p = pt(i, vMax * r / 4);
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
      const edge = pt(i, vMax);
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
      const lp = pt(i, vMax * 1.12);
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
    for (const s of visible) {
      const g = this.renderer.group(
        { class: `facet-series facet-radar ${s.name}` },
        this.renderer.root
      );
      const pts = cats.map((cat, i) => {
        const p = s.points.find((pp) => String(pp.x) === String(cat)) ?? s.points[i];
        return pt(i, p?.y ?? 0);
      });
      const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
      const fillOp = s.options.fillOpacity ?? (s.type === "area" ? 0.3 : 0.12);
      this.renderer.create(
        "polygon",
        {
          points: poly,
          fill: alpha(s.color, fillOp),
          stroke: s.color,
          "stroke-width": 2
        },
        g
      );
      pts.forEach((p, i) => {
        const point = s.points.find((pp) => String(pp.x) === String(cats[i])) ?? s.points[i];
        if (!point) return;
        const el = this.renderer.create(
          "circle",
          {
            cx: p.x,
            cy: p.y,
            r: 3.5,
            fill: s.color,
            stroke: "#fff",
            "stroke-width": 1,
            class: "facet-point"
          },
          g
        );
        this.bindTooltip(el, s, point);
        el.addEventListener(
          "click",
          (e) => this.handlePointEvent("click", s, point, e)
        );
      });
    }
  }
  // -- Marimekko (mosaic) ------------------------------------------------
  renderMarimekkoPanel(outer, visible) {
    if (!visible.length) return;
    const cats = this.currentCategories(visible) ?? [];
    if (!cats.length) return;
    const bottomReserve = 22, plot = {
      x: outer.x + 8,
      y: outer.y + 6,
      width: outer.width - 16,
      height: outer.height - bottomReserve - 6
    };
    const colTotal = cats.map(
      (c) => visible.reduce(
        (s, ser) => s + (ser.points.find((p) => String(p.x) === String(c))?.y ?? 0),
        0
      )
    );
    const grand = colTotal.reduce((a, b) => a + b, 0) || 1;
    const gap = 2;
    let x = plot.x;
    cats.forEach((cat, ci) => {
      const w = colTotal[ci] / grand * (plot.width - gap * (cats.length - 1));
      let y = plot.y;
      visible.forEach((s, si) => {
        const p = s.points.find((pp) => String(pp.x) === String(cat));
        const val = p?.y ?? 0;
        const h = colTotal[ci] > 0 ? val / colTotal[ci] * plot.height : 0;
        const el = this.renderer.create(
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
        if (p) {
          this.bindTooltip(el, s, p);
          el.addEventListener(
            "click",
            (e) => this.handlePointEvent("click", s, p, e)
          );
        }
        if (h > 16 && w > 26 && val > 0) {
          this.renderer.text(
            `${Math.round(val / colTotal[ci] * 100)}%`,
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
      });
      this.renderer.text(
        String(cat),
        x + w / 2,
        plot.y + plot.height + 14,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        this.renderer.root
      );
      x += w + gap;
    });
  }
  /**
   * Collapse each series' points into one aggregated value per unique
   * combination of `dims`. Leaves are ordered so that outer dimensions form
   * contiguous groups (first-seen order per level) so each group stays together.
   */
  buildNested(visible, dims, agg) {
    const order = dims.map(() => /* @__PURE__ */ new Map());
    const tuples = /* @__PURE__ */ new Map();
    for (const s of visible) {
      for (const p of s.points) {
        const tuple = dims.map((d) => String(p.options[d] ?? ""));
        tuple.forEach((v, lvl) => {
          if (!order[lvl].has(v)) order[lvl].set(v, order[lvl].size);
        });
        tuples.set(tuple.join("\0"), tuple);
      }
    }
    const leaves = [...tuples.values()].sort((a, b) => {
      for (let lvl = 0; lvl < dims.length; lvl++) {
        const d = order[lvl].get(a[lvl]) - order[lvl].get(b[lvl]);
        if (d !== 0) return d;
      }
      return 0;
    });
    const keys = leaves.map((l) => l.join("\0"));
    const keyIndex = new Map(keys.map((k, i) => [k, i]));
    const seriesPoints = /* @__PURE__ */ new Map();
    for (const s of visible) {
      const buckets = /* @__PURE__ */ new Map();
      for (const p of s.points) {
        const key = dims.map((d) => String(p.options[d] ?? "")).join("\0");
        (buckets.get(key) ?? buckets.set(key, []).get(key)).push(p.y ?? 0);
      }
      const pts = [];
      for (const [key, vals] of buckets) {
        const i = keyIndex.get(key);
        pts.push({
          x: key,
          index: i,
          y: this.aggregate(vals, agg),
          name: leaves[i].join(" / "),
          options: { y: this.aggregate(vals, agg) }
        });
      }
      pts.sort((a, b) => a.index - b.index);
      seriesPoints.set(s.index, pts);
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
    if (this.options.chart?.inverted) return true;
    return visible.some((s) => s.type === "bar");
  }
  // -- Scales ------------------------------------------------------------
  buildScales(visible, plot, inverted) {
    const categories = this.currentCategories(visible);
    const xAxisOpts = this.firstAxis(this.options.xAxis) ?? {};
    const yAxisOpts = this.firstAxis(this.options.yAxis) ?? {};
    let [vMin, vMax] = this.valueDomain(visible);
    const includeZero = visible.some(
      (s) => ["column", "bar", "area", "areaspline", "errorbar"].includes(s.type)
    );
    if (includeZero) {
      vMin = Math.min(vMin, 0);
      vMax = Math.max(vMax, 0);
    }
    const GEOM_PAD = {
      boxplot: 8,
      candlestick: 8,
      columnrange: 10
    };
    const bubble = visible.find((s) => s.type === "bubble");
    const bubbleR = bubble ? (bubble.options.sizeRange?.[1] ?? 34) + 2 : 0;
    const markerR = Math.max(
      bubbleR,
      ...visible.filter(
        (s) => s.type === "scatter" || s.type === "jitter" || s.type === "dumbbell"
      ).map((s) => (s.options.marker?.radius ?? 5) + 2),
      ...visible.map((s) => GEOM_PAD[s.type] ?? 0),
      0
    );
    if (markerR) {
      const valueAxisOpts = inverted ? xAxisOpts : yAxisOpts;
      const valuePx = inverted ? plot.width : plot.height;
      const padY = markerR / Math.max(1, valuePx) * (vMax - vMin || 1);
      if (valueAxisOpts.min === void 0) vMin -= padY;
      if (valueAxisOpts.max === void 0) vMax += padY;
    }
    const datetime = xAxisOpts.type === "datetime" && !categories;
    const xNumeric = (range, reversed) => {
      const [dmin, dmax] = this.xNumericDomain(visible);
      let min = xAxisOpts.min ?? dmin, max = xAxisOpts.max ?? dmax;
      if (markerR) {
        const padX = markerR / Math.max(1, plot.width) * (max - min || 1);
        if (xAxisOpts.min === void 0) min -= padX;
        if (xAxisOpts.max === void 0) max += padX;
      }
      if (datetime) {
        const { ticks, format } = niceDateTicks(min, max);
        return new LinearScale({
          domain: [min, max],
          range,
          reversed,
          ticks,
          format: (v) => formatDate(v, format)
        });
      }
      return new LinearScale({
        domain: [min, max],
        range,
        ...reversed ? { reversed } : {}
      });
    };
    const catScale = (range, reversed) => categories ? new CategoryScale({ categories, range, reversed }) : xNumeric(range, reversed);
    if (inverted) {
      const xScale2 = this.valueScale(
        xAxisOpts,
        [vMin, vMax],
        [plot.x, plot.x + plot.width]
      );
      const yScale2 = categories ? new CategoryScale({
        categories,
        range: [plot.y, plot.y + plot.height]
      }) : new LinearScale({
        domain: this.xNumericDomain(visible),
        range: [plot.y + plot.height, plot.y]
      });
      return { xScale: xScale2, yScale: yScale2 };
    }
    const xScale = catScale([plot.x, plot.x + plot.width], xAxisOpts.reversed);
    const yScale = this.valueScale(
      yAxisOpts,
      [vMin, vMax],
      [plot.y + plot.height, plot.y]
    );
    return { xScale, yScale };
  }
  valueScale(opts, domain, range) {
    const min = opts.min ?? domain[0];
    const max = opts.max ?? domain[1];
    if (opts.type === "log") return new LogScale({ domain: [min, max], range });
    return new LinearScale({
      domain: [min, max],
      range,
      tickCount: opts.tickCount
    });
  }
  valueDomain(visible) {
    const mins = [];
    const maxs = [];
    for (const s of visible) {
      if (!s.capabilities().cartesian) continue;
      const [lo, hi] = s.valueExtent();
      mins.push(lo);
      maxs.push(hi);
    }
    if (!mins.length) return [0, 1];
    return [Math.min(...mins), Math.max(...maxs)];
  }
  xNumericDomain(visible) {
    const xs = [];
    for (const s of visible)
      for (const p of s.points) if (typeof p.x === "number") xs.push(p.x);
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
      "butterfly"
    ]);
  }
  currentCategories(visible) {
    const xAxis = this.firstAxis(this.options.xAxis);
    if (xAxis?.categories) return xAxis.categories;
    const banded = xAxis?.type !== "datetime" && visible.some((s) => _FacetViz.BANDED.has(s.type));
    const allNumeric = visible.every(
      (s) => s.points.every((p) => typeof p.x === "number")
    );
    if (allNumeric && !banded) return void 0;
    const seen = /* @__PURE__ */ new Set();
    const cats = [];
    for (const s of visible)
      for (const p of s.points) {
        const key = String(p.x);
        if (!seen.has(key)) {
          seen.add(key);
          cats.push(key);
        }
      }
    return cats;
  }
  // -- Stacking & grouping ----------------------------------------------
  computeStacks(visible) {
    for (const s of visible)
      for (const p of s.points) {
        p.stackLow = void 0;
        p.stackHigh = void 0;
      }
    const groups = /* @__PURE__ */ new Map();
    for (const s of visible) {
      if (!s.options.stacking || !s.capabilities().stackable) continue;
      const key = `${s.options.yAxis ?? 0}:${s.options.stack ?? "default"}`;
      (groups.get(key) ?? groups.set(key, []).get(key)).push(s);
    }
    for (const [, group] of groups) {
      const mode = group[0].options.stacking;
      const indices = /* @__PURE__ */ new Set();
      for (const s of group) for (const p of s.points) indices.add(p.index);
      for (const idx of indices) {
        let posBase = 0;
        let negBase = 0;
        let total = 0;
        if (mode === "percent") {
          for (const s of group) {
            const p = s.points.find((pp) => pp.index === idx);
            total += Math.abs(p?.y ?? 0);
          }
        }
        for (const s of group) {
          const p = s.points.find((pp) => pp.index === idx);
          if (!p || p.y === void 0) continue;
          let y = p.y;
          if (mode === "percent" && total > 0) y = y / total * 100;
          if (y >= 0) {
            p.stackLow = posBase;
            p.stackHigh = posBase + y;
            posBase += y;
          } else {
            p.stackHigh = negBase;
            p.stackLow = negBase + y;
            negBase += y;
          }
        }
      }
    }
  }
  groupInfo(visible) {
    const columnKeys = [];
    const index = /* @__PURE__ */ new Map();
    for (const s of visible) {
      if (!s.capabilities().grouped) continue;
      const key = s.options.stacking ? `stack:${s.options.stack ?? "default"}` : `series:${s.index}`;
      let ci = columnKeys.indexOf(key);
      if (ci === -1) {
        ci = columnKeys.length;
        columnKeys.push(key);
      }
      index.set(s.index, ci);
    }
    return { count: Math.max(1, columnKeys.length), index };
  }
  // -- Series render context --------------------------------------------
  seriesContext(s, plot, xScale, yScale, group, inverted, polar) {
    return {
      renderer: this.renderer,
      plot,
      xScale,
      yScale,
      color: s.color,
      colors: this.colors,
      inverted,
      polar,
      groupCount: group.count,
      groupIndex: group.index.get(s.index) ?? 0,
      onPointEvent: (kind, p, dom) => this.handlePointEvent(kind, s, p, dom),
      registerHover: (el, p) => this.bindTooltip(el, s, p)
    };
  }
  bindTooltip(el, s, p) {
    this.applyHover(el, s);
    if (!this.tooltip) return;
    const total = s.points.reduce((sum2, pt) => sum2 + (pt.y ?? 0), 0);
    const build = () => {
      const ctx = {
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
      if (this.options.tooltip?.shared) ctx.points = this.pointsAtX(p.x);
      return ctx;
    };
    el.addEventListener("mouseenter", () => {
      this.tooltip.show(build(), s.options.tooltip);
      this.showCrosshair(p);
    });
    el.addEventListener(
      "mousemove",
      (e) => this.tooltip.move(e.clientX, e.clientY)
    );
    el.addEventListener("mouseleave", () => {
      this.tooltip.hide();
      this.hideCrosshair();
    });
  }
  /** Draw a guide line at the hovered point when `xAxis.crosshair` is on. */
  showCrosshair(p) {
    const ctx = this.plotCtx;
    if (!this.firstAxis(this.options.xAxis)?.crosshair || !ctx || ctx.inverted)
      return;
    this.hideCrosshair();
    const x = ctx.xScale.scale(p.x);
    this.crosshairEl = this.renderer.create(
      "line",
      {
        x1: x,
        y1: ctx.plot.y,
        x2: x,
        y2: ctx.plot.y + ctx.plot.height,
        stroke: THEME.axis.labelColor,
        "stroke-width": 1,
        "stroke-dasharray": "3 3",
        "pointer-events": "none",
        class: "facet-crosshair"
      },
      this.renderer.root
    );
  }
  hideCrosshair() {
    this.crosshairEl?.remove();
    this.crosshairEl = void 0;
  }
  /** All visible series' points sharing an x value (for the shared tooltip). */
  pointsAtX(x) {
    const rows = [];
    for (const s of this.series) {
      if (!s.visible || !s.capabilities().cartesian) continue;
      const match = s.points.find((pp) => String(pp.x) === String(x));
      if (!match) continue;
      rows.push({
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
    const hover = s.options.states?.hover;
    if (hover?.enabled === false) return;
    const scale = hover?.scale;
    const brightness = hover?.brightness ?? 0.08;
    const style = el.style;
    style.transition = "filter 0.12s ease";
    el.addEventListener("mouseenter", () => {
      style.filter = `brightness(${1 + brightness})`;
      if (scale) {
        style.transformBox = "fill-box";
        style.transformOrigin = "center";
        style.transition = "transform 0.12s ease, filter 0.12s ease";
        style.transform = `scale(${scale})`;
      }
    });
    el.addEventListener("mouseleave", () => {
      style.filter = "";
      if (scale) style.transform = "";
    });
  }
  handlePointEvent(kind, s, p, dom) {
    const payload = {
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
    const se = this.options.seriesEvents;
    if (kind === "click") {
      se?.click?.(payload);
      this.options.chart?.events?.click?.(payload);
      const ddId = p.options.drilldown;
      if (typeof ddId === "string") this.drillTo(ddId);
    }
    if (kind === "mouseOver") se?.mouseOver?.(payload);
    if (kind === "mouseOut") se?.mouseOut?.(payload);
  }
  /** Replace the series with the matching drilldown series (click-to-expand). */
  drillTo(id) {
    const dd = this.options.drilldown?.series.find((s) => s.id === id);
    if (!dd) return;
    this.drillStack.push({
      series: this.options.series,
      title: this.options.title,
      xAxis: this.options.xAxis
    });
    this.options.series = [dd];
    if (dd.name) this.options.title = { text: dd.name };
    const xa = this.axisAt(this.options.xAxis, 0);
    const { categories, ...rest } = xa;
    this.options.xAxis = rest;
    this.build();
    this.animateNext = true;
    this.render();
    this.events.emit("drilldown", { id, series: dd });
  }
  /** Return to the previous level after a drill-down. */
  drillUp() {
    const prev = this.drillStack.pop();
    if (!prev) return;
    this.options.series = prev.series;
    this.options.title = prev.title;
    this.options.xAxis = prev.xAxis;
    this.build();
    this.animateNext = true;
    this.render();
    this.events.emit("drillup", {});
  }
  /** Breadcrumb "← Back" control shown while drilled in. */
  drawDrillUp(outer) {
    if (!this.drillStack.length) return;
    const g = this.renderer.group(
      { class: "facet-drillup", style: "cursor:pointer" },
      this.renderer.root
    );
    const bx = outer.x, by = outer.y + 2;
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
    );
    this.renderer.text(
      "\u2190 Back",
      bx + 31,
      by + 15,
      {
        "text-anchor": "middle",
        ...FONTS.axisLabel,
        fill: this.theme.axis.labelColor
      },
      g
    );
    g.addEventListener("click", () => this.drillUp());
  }
  // -- Legend / visibility ----------------------------------------------
  /** Resolve where the legend sits from its layout/align/verticalAlign options. */
  legendPlacement() {
    const l = this.options.legend ?? {};
    if (l.layout === "vertical") return l.align === "left" ? "left" : "right";
    return l.verticalAlign === "top" ? "top" : "bottom";
  }
  /** True when the legend represents the points of a single non-cartesian
   *  series (pie / donut / radial bar) rather than one item per series. */
  isPointLegend() {
    const first = this.series[0];
    return this.series.length === 1 && !!first && first.capabilities().pointLegend === true;
  }
  buildLegendItems() {
    const first = this.series[0];
    if (this.series.length === 1 && first?.legendItems) {
      const custom = first.legendItems(this.colors);
      if (custom) return custom;
    }
    if (this.isPointLegend() && first) {
      return first.points.map((p, i) => ({
        label: String(p.name ?? p.x),
        color: p.color ?? paletteColor(this.colors, i),
        visible: !first.hiddenPoints.has(p.index)
      }));
    }
    return this.series.map((s) => ({
      label: s.name,
      color: s.color,
      visible: s.visible
    }));
  }
  toggleSeries(index) {
    const first = this.series[0];
    if (this.series.length === 1 && first?.legendItems && first.onLegendToggle && first.legendItems(this.colors)) {
      first.onLegendToggle(index);
      this.render();
      return;
    }
    if (this.isPointLegend()) {
      const p = first.points[index];
      if (!p) return;
      if (first.hiddenPoints.has(p.index)) first.hiddenPoints.delete(p.index);
      else first.hiddenPoints.add(p.index);
      this.options.seriesEvents?.legendItemClick?.({
        series: String(p.name ?? p.x),
        visible: !first.hiddenPoints.has(p.index)
      });
      this.render();
      return;
    }
    const s = this.series[index];
    if (!s) return;
    s.visible = !s.visible;
    this.options.seriesEvents?.legendItemClick?.({
      series: s.name,
      visible: s.visible
    });
    this.render();
  }
  // -- Public API --------------------------------------------------------
  /** Register a chart/point event callback. Returns an unsubscribe fn. */
  on(event, listener) {
    return this.events.on(event, listener);
  }
  /** Merge new options and re-render (rebuilds series when `series` is given). */
  update(options) {
    Object.assign(this.options, merge(this.options, options));
    if (options.series) this.build();
    this.animateNext = true;
    this.render();
  }
  /** Replace one series' data in place and re-render (incremental update). */
  setData(seriesIndex, data) {
    const opts = this.options.series[seriesIndex];
    if (!opts) return;
    opts.data = data;
    this.build();
    this.animateNext = true;
    this.render();
  }
  /** Append a point to a series and re-render. */
  addPoint(seriesIndex, point) {
    const opts = this.options.series[seriesIndex];
    if (!opts) return;
    opts.data = [...opts.data, point];
    this.build();
    this.render();
  }
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.render();
  }
  /** Serialise the chart to a standalone SVG string. */
  getSVG() {
    const clone = this.renderer.root.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(this.width));
    clone.setAttribute("height", String(this.height));
    return new XMLSerializer().serializeToString(clone);
  }
  /** Trigger a download of the chart as an SVG file. */
  downloadSVG(filename = "chart.svg") {
    this.triggerDownload(
      new Blob([this.getSVG()], { type: "image/svg+xml" }),
      filename
    );
  }
  /** Rasterise to PNG (`scale`× resolution) and download. */
  async downloadPNG(filename = "chart.png", scale = 2) {
    const blob = await this.toPNGBlob(scale);
    if (blob) this.triggerDownload(blob, filename);
  }
  /** Rasterise the chart to a PNG Blob. */
  toPNGBlob(scale = 2) {
    return new Promise((resolve) => {
      const svg = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(this.getSVG());
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = this.width * scale;
        canvas.height = this.height * scale;
        const c = canvas.getContext("2d");
        if (!c) return resolve(null);
        c.fillStyle = this.options.chart?.backgroundColor ?? this.theme.backgroundColor;
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, "image/png");
      };
      img.onerror = () => resolve(null);
      img.src = svg;
    });
  }
  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  destroy() {
    this.tooltip?.destroy();
    this.resizeObserver?.disconnect();
    this.events.clear();
    this.renderer?.root.remove();
  }
};
export {
  BaseSeries,
  CategoryScale,
  FacetViz as Chart,
  DEFAULT_COLORS,
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
  registerSeriesType,
  registerTheme,
  resolveTheme
};
