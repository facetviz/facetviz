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

// src/series/marker.ts
function drawMarker(renderer, parent, cx, cy, spec) {
  let { symbol, radius: r, fill, stroke, strokeWidth } = spec, common = {
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
    case "rectangle":
      return renderer.create(
        "rect",
        {
          x: cx - (spec.width ?? r * 2) / 2,
          y: cy - (spec.height ?? r * 2) / 2,
          width: spec.width ?? r * 2,
          height: spec.height ?? r * 2,
          ...common
        },
        parent
      );
    case "circle":
    default:
      return renderer.create("circle", { cx, cy, r, ...common }, parent);
  }
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
  axisTitleGap: 28,
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
function niceTicks(min, max, count = 6) {
  if (min === max) {
    let pad = Math.abs(min) || 1;
    min -= pad, max += pad;
  }
  let span = niceNum(max - min, !1), step = niceNum(span / Math.max(1, count - 1), !0), niceMin = Math.floor(min / step) * step, niceMax = Math.ceil(max / step) * step, ticks = [];
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
function sanitizeStyle(style) {
  if (!style) return {};
  let fontSize = style["font-size"];
  if (fontSize === void 0) return style;
  let clamped = clampFontSize(fontSize);
  return clamped === fontSize ? style : { ...style, "font-size": clamped };
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
function drawDataLabel(renderer, parent, text, place, dl) {
  if (!text) return;
  let attrs = {
    "text-anchor": place.anchor,
    ...FONTS.dataLabel,
    fill: dl.color ?? FONTS.dataLabel.fill,
    "font-size": dl.fontSize ? clampFontSize(dl.fontSize) : FONTS.dataLabel["font-size"]
  };
  if (dl.fontWeight && (attrs["font-weight"] = dl.fontWeight), dl.rotation && (attrs.transform = `rotate(${dl.rotation} ${place.x} ${place.y})`), dl.backgroundColor) {
    let w = text.length * 6.5 + 8, anchorX = place.anchor === "start" ? place.x - 4 : place.anchor === "end" ? place.x - w + 4 : place.x - w / 2;
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
    for (let segment of segments)
      renderer.create("path", {
        d: this.buildPath(segment.map((d) => d.pt)),
        fill: "none",
        stroke: this.color,
        "stroke-width": this.options.lineWidth ?? this.options.size ?? 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }, g);
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
        strokeWidth: marker.lineWidth ?? 1
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

// src/series/area.ts
var AreaSeries = class extends LineSeries {
  smooth() {
    return this.type === "areaspline";
  }
  buildPath(pts) {
    return this.smooth() ? splinePath(pts) : linePath(pts);
  }
  render(ctx) {
    let { renderer } = ctx, g = renderer.group({ class: `facet-series facet-area ${this.name}` }, renderer.root), top = [], bottom = [], hover = [], catScale = ctx.inverted ? ctx.yScale : ctx.xScale, valScale = ctx.inverted ? ctx.xScale : ctx.yScale, drawSegment = () => {
      if (!top.length) return;
      let line = this.smooth() ? splinePath : linePath, topD = line(top), bottomD = line([...bottom].reverse()).replace(/^M/, "L");
      renderer.create("path", {
        d: `${topD} ${bottomD} Z`,
        fill: alpha(this.color, 0.35),
        stroke: "none"
      }, g), renderer.create("path", {
        d: topD,
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
      let lo = p.stackLow !== void 0 ? p.stackLow : 0, catPx = catScale.scale(p.x), topPt = ctx.inverted ? { x: valScale.scale(hi), y: catPx } : { x: catPx, y: valScale.scale(hi) }, botPt = ctx.inverted ? { x: valScale.scale(lo), y: catPx } : { x: catPx, y: valScale.scale(lo) };
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
var THEME = { ...LIGHT_THEME };
function applyTheme(theme) {
  Object.assign(THEME, theme);
  let ff = theme.fontFamily;
  FONTS.title = { "font-size": theme.title.fontSize, "font-weight": theme.title.fontWeight, fill: theme.title.color, "font-family": ff }, FONTS.subtitle = { "font-size": theme.subtitle.fontSize, fill: theme.subtitle.color, "font-family": ff }, FONTS.axisLabel = { "font-size": "11px", fill: theme.axis.labelColor, "font-family": ff }, FONTS.axisTitle = { "font-size": "12px", fill: theme.axis.titleColor, "font-family": ff }, FONTS.legend = { "font-size": "12px", fill: theme.legend.color, "font-family": ff }, FONTS.dataLabel = { "font-size": "11px", fill: theme.dataLabel.color, "font-family": ff };
}

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
      for (let val of box.outliers ?? []) {
        let pos = v(val), oc = inverted ? { x: pos, y: c } : { x: c, y: pos };
        drawMarker(renderer, g, oc.x, oc.y, {
          symbol: om.symbol ?? "circle",
          radius: outlierR,
          fill: om.fillColor ?? THEME.backgroundColor,
          stroke: om.lineColor ?? stroke,
          strokeWidth: om.lineWidth ?? 1.5
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
    }, labelData = [];
    for (let p of this.points) {
      if (p.y === void 0) continue;
      let x = xScale.scale(p.x), y = yScale.scale(p.y), base = p.color ?? this.color, el = drawMarker(renderer, g, x, y, {
        symbol: this.options.marker?.symbol ?? "circle",
        radius: radiusFor(p.options.z ?? 1),
        fill: alpha(base, 0.55),
        stroke: base,
        strokeWidth: 1
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
      lbl && renderer.text(lbl, gx - 5, gy + i * step + cell / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel, "font-size": "9px" }, g);
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
      ctx.registerHover(el, d.point), el.addEventListener("click", (e) => ctx.onPointEvent("click", d.point, e)), d.date.getMonth() !== lastMonth && (lastMonth = d.date.getMonth(), renderer.text(MONTHS2[lastMonth], x, plot.y + 9, { "text-anchor": "start", ...FONTS.axisLabel, "font-size": "9px" }, g));
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
var ColumnSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !0, cartesian: !0, stackable: !0 };
  }
  pointValues(p) {
    return p.stackHigh !== void 0 ? [p.stackLow, p.stackHigh] : [0, p.y];
  }
  render(ctx) {
    let { renderer, groupCount, groupIndex } = ctx, horizontal = this.type === "bar" || ctx.inverted, catScale = horizontal ? ctx.yScale : ctx.xScale, valScale = horizontal ? ctx.xScale : ctx.yScale, g = renderer.group({
      class: `facet-series facet-column ${this.name}`
    }), band = catScale.bandwidth(), subWidth = band / groupCount;
    for (let p of this.points) {
      let [loVal, hiVal] = this.valuePair(p);
      if (loVal === void 0 || hiVal === void 0) continue;
      let catStart = catScale.scale(p.x) - band / 2 + groupIndex * subWidth, vLo = valScale.scale(loVal), vHi = valScale.scale(hiVal), max_colWidth = Math.max(1, subWidth * 0.9), colWidth = p.options.columnWidth ?? this.options.columnWidth ?? this.options.size ?? max_colWidth, rect;
      horizontal ? rect = {
        x: Math.min(vLo, vHi),
        y: catStart + (subWidth - colWidth) / 2,
        width: Math.max(1, Math.abs(vHi - vLo)),
        height: colWidth
      } : rect = {
        x: catStart + (subWidth - colWidth) / 2,
        y: Math.min(vLo, vHi),
        width: colWidth,
        height: Math.max(1, Math.abs(vHi - vLo))
      };
      let el = renderer.create(
        "rect",
        {
          ...rect,
          rx: 1,
          fill: p.color ?? this.color,
          class: "facet-point"
        },
        g
      );
      ctx.registerHover(el, p), this.wireEvents(el, p, ctx), this.drawDataLabel(ctx, p, rect, g);
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
      let cy = rect.y + rect.height / 2 + 4, end = rect.x + rect.width;
      pos === "inside" ? place = { x: end - 4 - d, y: cy, anchor: "end" } : pos === "center" ? place = { x: rect.x + rect.width / 2, y: cy, anchor: "middle" } : pos === "base" ? place = { x: rect.x + 4 + d, y: cy, anchor: "start" } : place = { x: end + 4 + d, y: cy, anchor: "start" };
    } else {
      let cx = rect.x + rect.width / 2;
      pos === "inside" ? place = { x: cx, y: rect.y + 12 + d, anchor: "middle" } : pos === "center" ? place = { x: cx, y: rect.y + rect.height / 2 + 4, anchor: "middle" } : pos === "base" ? place = { x: cx, y: rect.y + rect.height - 5 - d, anchor: "middle" } : place = { x: cx, y: rect.y - 4 - d, anchor: "middle" };
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
    let { renderer, groupCount, groupIndex, inverted } = ctx, catScale = inverted ? ctx.yScale : ctx.xScale, valScale = inverted ? ctx.xScale : ctx.yScale, g = renderer.group(
      { class: `facet-series facet-dumbbell ${this.name}` },
      renderer.root
    ), band = catScale.bandwidth ? catScale.bandwidth() : 0, subWidth = band / groupCount, radius = this.options.marker?.radius ?? 5, rectWidth = this.options.marker?.width ?? 5, rectHeight = this.options.marker?.height ?? 5, isRect = this.options.marker?.symbol === "rectangle";
    for (let p of this.points) {
      if (p.low === void 0 || p.high === void 0) continue;
      let lowColor = p.options.lowColor ?? this.options.lowColor ?? this.color, highColor = p.options.highColor ?? this.options.highColor ?? this.color, connColor = p.options.connectorColor ?? this.options.connectorColor ?? THEME.neutralColor, connWidth = p.options.connectorWidth ?? this.options.connectorWidth ?? 7, cat = catScale.scale(p.x) - band / 2 + (groupIndex + 0.5) * subWidth, vLow = valScale.scale(p.low), vHigh = valScale.scale(p.high), conn = isRect ? inverted ? {
        x1: vLow < vHigh ? vLow + radius : vLow - radius,
        y1: cat,
        x2: vLow < vHigh ? vHigh - radius : vHigh + radius,
        y2: cat
      } : {
        x1: cat,
        y1: vLow < vHigh ? vLow + radius : vLow - radius,
        x2: cat,
        y2: vLow < vHigh ? vHigh - radius : vHigh + radius
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
        let el = drawMarker(renderer, g, inverted ? v : cat, inverted ? cat : v, {
          symbol: this.options.marker?.symbol ?? "circle",
          radius,
          fill: color,
          stroke: "#fff",
          strokeWidth: 1.5,
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
      inverted ? (line({ x1: vLo, y1: c - cap, x2: vLo, y2: c + cap }), line({ x1: vHi, y1: c - cap, x2: vHi, y2: c + cap })) : (line({ x1: c - cap, y1: vLo, x2: c + cap, y2: vLo }), line({ x1: c - cap, y1: vHi, x2: c + cap, y2: vHi })), ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
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
      ctx.registerHover(bar, t.point), bar.addEventListener("click", (e) => ctx.onPointEvent("click", t.point, e)), renderer.text(t.name, gx - 6, y + rowH / 2, { "text-anchor": "end", "dominant-baseline": "middle", ...FONTS.axisLabel }, g);
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
var START = 135, SWEEP = 270, GaugeSeries = class extends BaseSeries {
  capabilities() {
    return { grouped: !1, cartesian: !1, stackable: !1 };
  }
  render(ctx) {
    let { renderer, plot } = ctx, g = renderer.group({ class: `facet-series facet-gauge ${this.name}` }, renderer.root), p = this.points[0];
    if (!p) return;
    let min = this.options.min ?? 0, max = this.options.max ?? 100, value = p.y ?? 0, frac = Math.max(0, Math.min(1, (value - min) / (max - min || 1))), cx = plot.x + plot.width / 2, cy = plot.y + plot.height * 0.62, r = Math.min(plot.width * 0.44, plot.height * 0.5) - 6, thickness = Math.max(10, r * 0.16);
    renderer.create("path", { d: this.arc(cx, cy, r, START, START + SWEEP), fill: "none", stroke: THEME.axis.gridLineColor, "stroke-width": thickness, "stroke-linecap": "round" }, g);
    let bands = this.options.bands;
    if (bands)
      for (let b of bands) {
        let a0 = START + SWEEP * ((b.from - min) / (max - min || 1)), a1 = START + SWEEP * ((b.to - min) / (max - min || 1));
        renderer.create("path", { d: this.arc(cx, cy, r, a0, a1), fill: "none", stroke: b.color, "stroke-width": thickness, "stroke-linecap": "butt" }, g);
      }
    else
      renderer.create("path", { d: this.arc(cx, cy, r, START, START + SWEEP * frac), fill: "none", stroke: p.color ?? this.color, "stroke-width": thickness, "stroke-linecap": "round" }, g);
    let ang = (START + SWEEP * frac) * Math.PI / 180, nr = r - thickness / 2, needle = renderer.create("line", {
      x1: cx,
      y1: cy,
      x2: cx + nr * Math.cos(ang),
      y2: cy + nr * Math.sin(ang),
      stroke: "#333",
      "stroke-width": 3,
      "stroke-linecap": "round",
      class: "facet-point"
    }, g);
    renderer.create("circle", { cx, cy, r: 6, fill: "#333" }, g), renderer.text(String(value), cx, cy + r * 0.5, { "text-anchor": "middle", ...FONTS.title, "font-size": "22px" }, g), (p.name ?? this.name) && renderer.text(String(p.name ?? this.name), cx, cy + r * 0.5 + 18, { "text-anchor": "middle", ...FONTS.subtitle }, g), ctx.registerHover(needle, p), needle.addEventListener("click", (e) => ctx.onPointEvent("click", p, e));
  }
  /** SVG arc path from startDeg to endDeg on a circle. */
  arc(cx, cy, r, a0, a1) {
    let p0 = this.pt(cx, cy, r, a0), p1 = this.pt(cx, cy, r, a1), large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
  }
  pt(cx, cy, r, deg) {
    let a = deg * Math.PI / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
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
      cw > 26 && ch > 16 && renderer.text(String(value), x + cw / 2, y + ch / 2, {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: (value - min) / (max - min || 1) > 0.6 ? "#fff" : shade(hi, -0.4),
        "font-size": "10px"
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
    ), band = catScale.bandwidth ? catScale.bandwidth() : 0, subWidth = band / groupCount, radius = this.options.marker?.radius ?? 5, stemWidth = this.options.lineWidth ?? this.options.size ?? 2;
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
      let cx = inverted ? vEnd : cat, cy = inverted ? cat : vEnd, el = drawMarker(renderer, g, cx, cy, {
        symbol: this.options.marker?.symbol ?? "circle",
        radius,
        fill: color,
        stroke: "#fff",
        strokeWidth: 1.5
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
    let { renderer, plot } = ctx, g = renderer.group({ class: `facet-series facet-pie ${this.name}` }, renderer.root), dl = this.options.dataLabels, outside = !!dl?.enabled && (dl.position ?? "outside") !== "inside", margin = outside ? 48 : 6, c = {
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
    let layout = { lastY: {} }, innerR = c.radius * this.innerRatio(), points = this.visiblePoints(), total = sum(points.map((p) => p.y ?? 0));
    if (total <= 0) return;
    let zs = points.map((p) => p.options.z).filter((z) => typeof z == "number"), variable = zs.length > 0, zMin = variable ? Math.min(...zs) : 0, zMax = variable ? Math.max(...zs) : 1, minR = innerR + (c.radius - innerR) * 0.45, radiusFor = (p) => {
      let z = p.options.z;
      return !variable || typeof z != "number" ? c.radius : minR + (c.radius - minR) * (zMax === zMin ? 1 : (z - zMin) / (zMax - zMin));
    }, angle = -Math.PI / 2;
    points.forEach((p) => {
      let value = p.y ?? 0;
      if (value <= 0) return;
      let sweep = value / total * Math.PI * 2, end = angle + sweep, color = p.color ?? paletteColor(ctx.colors, this.points.indexOf(p)), rr = radiusFor(p), path = this.slicePath(c.cx, c.cy, rr, innerR, angle, end), el = renderer.create("path", { d: path, fill: color, stroke: "#ffffff", "stroke-width": 1, class: "facet-point" }, g);
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
      let label = this.labelText(p, p.name ?? p.x, value, total);
      this.drawLabel(ctx, g, c, rr, angle, end, label, color, layout), angle = end;
    });
  }
  /** Two-dimension pie: inner ring = first field, outer ring = second field. */
  renderMultiLevel(ctx, g, c) {
    let dims = this.dims(), { renderer } = ctx, holeR = c.radius * this.innerRatio(), midR = holeR + (c.radius - holeR) * 0.55, order = this.groups(), buckets = /* @__PURE__ */ new Map();
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
        ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e));
        let name = String(p.options[dims[1]] ?? p.name ?? p.x), label = this.labelText(p, name, value, total);
        this.drawLabel(ctx, g, c, c.radius, a2, e2, label, color, layout), a2 = e2;
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
   * Draw a slice label. Inside labels sit on the ring; outside labels are placed
   * beyond the rim and joined to the slice with a leader line (elbow + stub) so
   * it is unambiguous which label belongs to which slice.
   *
   * A shrunk pie packs slices (and their labels) closer together — rather than
   * the chart forcing every label off past some size threshold, a label that
   * doesn't fit its own slice (inside) or would collide with the previous one
   * on its side (outside) is simply skipped, leaving the rest legible.
   */
  drawLabel(ctx, g, c, rimR, a0, a1, text, sliceColor, layout) {
    let dl = this.options.dataLabels;
    if (!dl?.enabled || !text) return;
    let { renderer } = ctx, mid = (a0 + a1) / 2, fontPx = parseFloat(dl.fontSize ?? FONTS.dataLabel["font-size"] ?? "11") || 11;
    if (!c.outside) {
      let lr = rimR * 0.72, chord = 2 * lr * Math.sin(Math.min(Math.PI, a1 - a0) / 2);
      if (text.length * fontPx * 0.62 > chord) return;
      renderer.text(text, c.cx + lr * Math.cos(mid), c.cy + lr * Math.sin(mid), {
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        ...FONTS.dataLabel,
        fill: dl.color ?? "#ffffff",
        ...dl.fontSize ? { "font-size": dl.fontSize } : {}
      }, g);
      return;
    }
    let dir = Math.cos(mid) >= 0 ? 1 : -1, side = dir > 0 ? "right" : "left", rimX = c.cx + rimR * Math.cos(mid), rimY = c.cy + rimR * Math.sin(mid), elbowR = rimR + 10 + (dl.distance ?? 0), elbowX = c.cx + elbowR * Math.cos(mid), elbowY = c.cy + elbowR * Math.sin(mid), stubX = elbowX + dir * 16, lastY = layout.lastY[side];
    lastY !== void 0 && Math.abs(elbowY - lastY) < fontPx + 3 || (layout.lastY[side] = elbowY, renderer.create("polyline", {
      points: `${rimX},${rimY} ${elbowX},${elbowY} ${stubX},${elbowY}`,
      fill: "none",
      stroke: dl.color ?? sliceColor,
      "stroke-width": 1
    }, g), renderer.text(text, stubX + dir * 4, elbowY, {
      "text-anchor": dir > 0 ? "start" : "end",
      "dominant-baseline": "middle",
      ...FONTS.dataLabel,
      fill: dl.color ?? FONTS.dataLabel.fill,
      ...dl.fontSize ? { "font-size": dl.fontSize } : {}
    }, g));
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
    return { grouped: !1, cartesian: !1, stackable: !1, pointLegend: !0 };
  }
  render(ctx) {
    let { renderer, plot, colors } = ctx, g = renderer.group({ class: `facet-series facet-radialbar ${this.name}` }, renderer.root), cx = plot.x + plot.width / 2, cy = plot.y + plot.height / 2, outer = Math.min(plot.width, plot.height) / 2 - 4, points = this.visiblePoints(), max = Math.max(1, ...points.map((p) => p.y ?? 0)), n = points.length || 1, ringWidth = outer * 0.7 / n, gap = ringWidth * 0.25, startAngle = -Math.PI / 2, fullSweep = Math.PI * 2 * 270 / 360, labelX = cx - 8;
    points.forEach((p, i) => {
      let value = p.y ?? 0, rOuter = outer - i * ringWidth, rInner = rOuter - (ringWidth - gap), color = p.color ?? paletteColor(colors, this.points.indexOf(p)), frac = Math.max(0, Math.min(1, value / max));
      renderer.create("path", {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep),
        fill: alpha(color, 0.15),
        stroke: "none"
      }, g);
      let el = renderer.create("path", {
        d: this.arcBand(cx, cy, rInner, rOuter, startAngle, startAngle + fullSweep * frac),
        fill: color,
        stroke: "none",
        class: "facet-point"
      }, g);
      ctx.registerHover(el, p), el.addEventListener("click", (e) => ctx.onPointEvent("click", p, e)), el.addEventListener("mouseover", (e) => ctx.onPointEvent("mouseOver", p, e)), el.addEventListener("mouseout", (e) => ctx.onPointEvent("mouseOut", p, e)), renderer.text(String(p.name ?? p.x), labelX, cy - (rInner + rOuter) / 2 + 4, {
        "text-anchor": "end",
        ...FONTS.dataLabel,
        "font-size": "10px"
      }, g);
    });
  }
  /** A filled band between two radii swept between two angles. */
  arcBand(cx, cy, ri, ro, a0, a1) {
    if (a1 <= a0 + 1e-4) return "";
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
    renderer.create("path", { d: `${topD} ${bottomD} Z`, fill: alpha(this.color, 0.35), stroke: "none" }, g), renderer.create("path", { d: topD, fill: "none", stroke: this.color, "stroke-width": this.options.lineWidth ?? 2 }, g), renderer.create("path", { d: line(bottom), fill: "none", stroke: this.color, "stroke-width": this.options.lineWidth ?? 2 }, g);
    let marker = this.options.marker, visible = marker?.enabled !== !1;
    drawn.forEach((p, i) => {
      for (let pt of [top[i], bottom[i]]) {
        let el = visible ? drawMarker(renderer, g, pt.x, pt.y, {
          symbol: marker?.symbol ?? "circle",
          radius: marker?.radius ?? 3.5,
          fill: marker?.fillColor ?? this.color,
          stroke: marker?.lineColor ?? "#fff",
          strokeWidth: marker?.lineWidth ?? 1
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
      ctx.registerHover(path, l.point), path.addEventListener("click", (e) => ctx.onPointEvent("click", l.point, e)), outOff.set(s.id, so + th), inOff.set(t.id, to + th);
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
    [this.d0, this.d1] = cfg.domain, [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range, this.format = cfg.format, this.tickValues = cfg.ticks ?? niceTicks(this.d0, this.d1, cfg.tickCount ?? 6), cfg.nice !== !1 && this.tickValues.length ? (this.d0 = Math.min(this.d0, this.tickValues[0]), this.d1 = Math.max(this.d1, this.tickValues[this.tickValues.length - 1])) : cfg.nice === !1 && (this.tickValues = this.tickValues.filter((v) => v >= this.d0 && v <= this.d1), this.tickValues.includes(this.d0) || this.tickValues.unshift(this.d0), this.tickValues.includes(this.d1) || this.tickValues.push(this.d1));
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
    ), catScale = ctx.inverted ? ctx.yScale : ctx.xScale, valScale = ctx.inverted ? ctx.xScale : ctx.yScale, marker = this.options.marker ?? {}, rng = seededRandom(this.index * 7919 + this.points.length + 1), band = catScale instanceof CategoryScale ? catScale.bandwidth() : 0, spread = (this.options.jitter ?? 0.5) * band, labelData = [];
    for (let p of this.points) {
      if (p.y === void 0) continue;
      let catPx = catScale.scale(p.x);
      this.isJitter && band > 0 && (catPx += (rng() - 0.5) * spread);
      let valPx = valScale.scale(p.y), x = ctx.inverted ? valPx : catPx, y = ctx.inverted ? catPx : valPx;
      labelData.push({ pt: { x, y }, p });
      let el = drawMarker(renderer, g, x, y, {
        symbol: marker.symbol ?? "circle",
        radius: p.options.radius ?? this.options.radius ?? this.options.size ?? marker.radius ?? 5,
        fill: p.color ?? marker.fillColor ?? this.color,
        stroke: marker.lineColor ?? "#ffffff",
        strokeWidth: marker.lineWidth ?? 1
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
    let radius = this.options.marker?.radius ?? 4.5;
    data.forEach(({ pt, p }, i) => {
      let color = p.color ?? this.color, el = drawMarker(renderer, g, pt.x, pt.y, {
        symbol: this.options.marker?.symbol ?? "circle",
        radius,
        fill: color,
        stroke: "#fff",
        strokeWidth: 1.5
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
    let opts = this.options.sparkline ?? {}, radius = this.options.marker?.radius ?? 2.5, dot = (point, spec, defaultColor) => {
      if (!spec) return;
      let color = (typeof spec == "object" ? spec.color : void 0) ?? defaultColor;
      drawMarker(renderer, g, point.pt.x, point.pt.y, {
        symbol: this.options.marker?.symbol ?? "circle",
        radius,
        fill: color,
        stroke: "#fff",
        strokeWidth: 1
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
        if (n.point && (ctx.registerHover(el, n.point), el.addEventListener("click", (e) => ctx.onPointEvent("click", n.point, e))), a1 - a0 > 0.18 && rOut - rIn > 14) {
          let mid = (a0 + a1) / 2, rMid = (rIn + rOut) / 2;
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
        "font-size": "11px"
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
  registerAreaSeries(), registerBoxplotSeries(), registerBubbleSeries(), registerBulletSeries(), registerCalendarSeries(), registerCandlestickSeries(), registerColumnSeries(), registerColumnRangeSeries(), registerDumbbellSeries(), registerErrorBarSeries(), registerFunnelSeries(), registerGanttSeries(), registerGaugeSeries(), registerHeatmapSeries(), registerHistogramSeries(), registerLineSeries(), registerLollipopSeries(), registerMarimekkoSeries(), registerPieSeries(), registerRadarSeries(), registerRadialBarSeries(), registerRangeSeries(), registerSankeySeries(), registerScatterSeries(), registerSlopeSeries(), registerSparklineSeries(), registerSunburstSeries(), registerTimelineSeries(), registerTreegraphSeries(), registerWaterfallSeries();
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
var Axis = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  get horizontal() {
    return this.cfg.position === "bottom" || this.cfg.position === "top";
  }
  render(parent) {
    let { renderer, scale, options, position } = this.cfg;
    if (options.visible === !1) return;
    let group = renderer.group({ class: `facet-axis facet-axis-${position}` }, parent), ticks = scale.ticks(), isCategory = scale instanceof CategoryScale;
    this.drawPlotBands(group);
    let axisColor = options.lineColor ?? THEME.axis.lineColor;
    if (options.lineWidth !== 0) {
      let line = this.axisLineCoords();
      renderer.create("line", {
        ...line,
        stroke: axisColor,
        "stroke-width": options.lineWidth ?? 1
      }, group);
    }
    let labelsEnabled = options.labels?.enabled !== !1, gridColor = options.gridLineColor ?? THEME.axis.gridLineColor, gridWidth = options.gridLineWidth ?? 1, labelStep = 1;
    if (isCategory && labelsEnabled && this.horizontal && !options.labels?.rotation) {
      let band = scale.bandwidth();
      if (band > 0) {
        let estW = ticks.reduce((m, t) => Math.max(m, this.labelText(scale, t).length), 0) * 6.2 + 6;
        estW > band && (labelStep = Math.ceil(estW / band));
      }
    }
    ticks.forEach((tick, i) => {
      let pos = scale.scale(tick);
      this.cfg.grid && gridWidth > 0 && (!isCategory || options.gridLineWidth) && this.drawGridLine(group, pos, gridColor, gridWidth), options.ticks !== !1 && this.drawTick(group, pos, axisColor), labelsEnabled && i % labelStep === 0 && this.drawLabel(group, pos, this.labelText(scale, tick), options);
    }), this.drawPlotLines(group, "below"), options.title?.text && this.drawTitle(group, options.title.text);
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
  /** Shaded bands spanning an axis interval (horizontal or vertical). */
  drawPlotBands(g) {
    let { renderer, scale, plot } = this.cfg;
    for (let band of this.cfg.options.plotBands ?? []) {
      let p0 = scale.scale(band.from), p1 = scale.scale(band.to), rect = this.horizontal ? { x: Math.min(p0, p1), y: plot.y, width: Math.abs(p1 - p0), height: plot.height } : { x: plot.x, y: Math.min(p0, p1), width: plot.width, height: Math.abs(p1 - p0) };
      renderer.create("rect", { ...rect, fill: band.color ?? "rgba(70,130,180,0.12)", stroke: "none", class: "facet-plotband" }, g), band.label?.text && renderer.text(band.label.text, rect.x + 4, rect.y + 12, {
        ...FONTS.axisLabel,
        fill: band.label.color ?? "#666",
        "text-anchor": "start"
      }, g);
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
  drawGridLine(g, pos, color, width) {
    let { renderer, plot } = this.cfg;
    this.horizontal ? renderer.create("line", { x1: pos, y1: plot.y, x2: pos, y2: plot.y + plot.height, stroke: color, "stroke-width": width }, g) : renderer.create("line", { x1: plot.x, y1: pos, x2: plot.x + plot.width, y2: pos, stroke: color, "stroke-width": width }, g);
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
  drawLabel(g, pos, text, options) {
    let { renderer, plot, position } = this.cfg, style = { ...FONTS.axisLabel, ...sanitizeStyle(options.labels?.style) };
    if (!options.labels?.style?.["font-size"]) {
      let shortSide = Math.min(plot.width, plot.height);
      shortSide < 120 ? style["font-size"] = "9px" : shortSide < 220 && (style["font-size"] = "10px");
    }
    let rotation = options.labels?.rotation ?? 0, x = 0, y = 0, anchor = "middle", baseline = "middle";
    switch (position) {
      case "bottom":
        x = pos, y = plot.y + plot.height + LAYOUT.tickLength + (rotation ? 8 : 7), baseline = rotation ? "middle" : "hanging", anchor = rotation ? rotation < 0 ? "end" : "start" : "middle";
        break;
      case "top":
        x = pos, y = plot.y - LAYOUT.tickLength - (rotation ? 8 : 6), anchor = rotation ? rotation < 0 ? "start" : "end" : "middle";
        break;
      case "left":
        x = plot.x - LAYOUT.tickLength - 4, y = pos, anchor = "end";
        break;
      case "right":
        x = plot.x + plot.width + LAYOUT.tickLength + 4, y = pos, anchor = "start";
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
    let { renderer, plot, position } = this.cfg, style = FONTS.axisTitle, gap = this.cfg.options.labels?.enabled !== !1 ? this.labelExtent() : 0;
    if (this.horizontal) {
      let x = plot.x + plot.width / 2, y = position === "bottom" ? plot.y + plot.height + LAYOUT.tickLength + gap + 22 : plot.y - LAYOUT.tickLength - gap - 18;
      renderer.text(text, x, y, { "text-anchor": "middle", ...style }, g);
    } else {
      let x = position === "left" ? plot.x - LAYOUT.tickLength - 4 - gap - 8 : plot.x + plot.width + LAYOUT.tickLength + 4 + gap + 8, y = plot.y + plot.height / 2, rot = position === "left" ? -90 : 90;
      renderer.text(text, x, y, { "text-anchor": "middle", transform: `rotate(${rot} ${x} ${y})`, ...style }, g);
    }
  }
  /**
   * Estimated size of the tick labels along the axis-title direction: the
   * widest label (px) for vertical axes, or the label height for horizontal
   * axes. Used to offset the title clear of the labels.
   */
  labelExtent() {
    let { scale, options } = this.cfg, fontPx = parseFloat(options.labels?.style?.["font-size"] ?? FONTS.axisLabel["font-size"] ?? "11") || 11, charW = fontPx * 0.6, maxW = 0;
    for (let t of scale.ticks())
      maxW = Math.max(maxW, this.labelText(scale, t).length * charW);
    let rot = options.labels?.rotation ?? 0;
    return this.horizontal ? rot ? Math.abs(Math.sin(rot * Math.PI / 180)) * maxW + fontPx : fontPx + 2 : maxW;
  }
};

// src/core/nested-axis.ts
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
  /** No-ops (and returns undefined) when labels are switched off. */
  text(text, x, y, attrs, g) {
    if (this.labelsOn)
      return this.cfg.renderer.text(text, x, y, attrs, g);
  }
  /** No-ops when the axis's own lines (baseline, dividers) are switched off. */
  line(attrs, g) {
    this.linesOn && this.cfg.renderer.create("line", attrs, g);
  }
  render(parent) {
    let g = this.cfg.renderer.group(
      { class: "facet-axis facet-axis-nested" },
      parent
    );
    this.drawLeafGridlines(g), this.cfg.vertical ? this.cfg.position === "split" ? this.renderSplitVertical(g) : this.renderStackedVertical(g, this.cfg.position === "top") : this.cfg.position === "split" ? this.renderSplit(g) : this.renderStacked(g, this.cfg.position === "top");
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
    }, leafCenter = (i) => scale.scale(keys[i]), bandHalf = scale.fullStep() / 2, bottomY = plot.y + plot.height;
    this.line(
      { x1: plot.x, y1: baseY, x2: plot.x + plot.width, y2: baseY, stroke: color },
      g
    );
    for (let level = levels - 1; level >= 0; level--) {
      let row = levels - 1 - level, rotated = row === 0 && rotation, rowStart = baseY + dir * (LAYOUT.tickLength + rowOffset(row)), segments = this.segmentsForLevel(leaves, level), labelY = rowStart + dir * (rotated ? 8 : 12), labelSegs = row === 0 && !rotated ? this.thinnedInnerSegments(scale.bandwidth()) : segments;
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
      if (level < levels - 1)
        for (let s = 1; s < segments.length; s++) {
          let bx = leafCenter(segments[s].startLeaf) - bandHalf;
          this.line(
            {
              x1: bx,
              y1: baseY,
              x2: bx,
              y2: rowStart + dir * rowHeight(row),
              stroke: color,
              "stroke-width": 1
            },
            g
          );
        }
    }
    let topExtent = plot.y, outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      let bx = leafCenter(outer[s].startLeaf) - bandHalf;
      this.line(
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
    let { scale, plot, leaves, keys } = this.cfg, color = this.cfg.lineColor ?? THEME.axis.lineColor, levels = leaves[0]?.length ?? 0, rowH = 18, leafCenter = (i) => scale.scale(keys[i]), bandHalf = scale.fullStep() / 2, bottomY = plot.y + plot.height;
    this.line(
      { x1: plot.x, y1: bottomY, x2: plot.x + plot.width, y2: bottomY, stroke: color },
      g
    );
    let rotation = this.cfg.labels?.rotation ?? 0, innerLabelY = bottomY + LAYOUT.tickLength + (rotation ? 8 : 12), innerSegments = rotation ? this.segmentsForLevel(leaves, levels - 1) : this.thinnedInnerSegments(scale.bandwidth());
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
      let rowFromTop = levels - 2 - level, labelY = plot.y - LAYOUT.tickLength - rowFromTop * rowH - 4;
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
    let topExtent = plot.y - LAYOUT.tickLength - (levels - 1) * rowH, outer = this.segmentsForLevel(leaves, 0);
    for (let s = 1; s < outer.length; s++) {
      let bx = leafCenter(outer[s].startLeaf) - bandHalf;
      this.line(
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
      let w = colWidths[level], colStart = baseX + dir * (LAYOUT.tickLength + offset), segments = this.segmentsForLevel(leaves, level), labelX = colStart + dir * (w / 2);
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
    let farEdge = baseX + dir * (LAYOUT.tickLength + offset), outer = this.segmentsForLevel(leaves, 0);
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
        plot.x - LAYOUT.tickLength - innerW / 2,
        cy,
        { "text-anchor": "middle", ...FONTS.axisLabel },
        g
      );
    }
    let offset = 0;
    for (let level = levels - 2; level >= 0; level--) {
      let w = colWidths[level], labelX = rightX + LAYOUT.tickLength + offset + w / 2;
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
    let leftExtent = plot.x - LAYOUT.tickLength - innerW, rightExtent = rightX + LAYOUT.tickLength + offset, outer = this.segmentsForLevel(leaves, 0);
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
var SWATCH = 12, CHAR_W = 7, ITEM_GAP = 18, ROW_H = 20, Legend = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  /** Estimated width of a vertical legend column (for space reservation). */
  static verticalWidth(items) {
    let longest = items.reduce((m, it) => Math.max(m, it.label.length), 0);
    return SWATCH + 8 + longest * CHAR_W + 8;
  }
  render(parent) {
    if (this.cfg.options.enabled === !1 || !this.cfg.items.length) return;
    let g = this.cfg.renderer.group({ class: "facet-legend" }, parent);
    this.cfg.layout === "vertical" ? this.renderVertical(g) : this.renderHorizontal(g);
  }
  drawItem(g, it, index, x, y) {
    let { renderer, onToggle } = this.cfg, item = renderer.group({ class: "facet-legend-item", style: "cursor:pointer" }, g);
    renderer.create("rect", {
      x,
      y,
      width: SWATCH,
      height: SWATCH,
      rx: 2,
      fill: it.visible ? it.color : THEME.legend.hiddenColor
    }, item);
    let label = renderer.text(it.label, x + SWATCH + 6, y + SWATCH - 2, {
      ...FONTS.legend,
      fill: it.visible ? FONTS.legend.fill : THEME.legend.hiddenColor,
      "text-decoration": it.visible ? "none" : "line-through"
    }, item);
    label.style.userSelect = "none", item.addEventListener("click", () => onToggle(index));
  }
  renderHorizontal(g) {
    let { items, options, width, x: originX, y } = this.cfg, widths = items.map((it) => SWATCH + 6 + it.label.length * CHAR_W + ITEM_GAP), rows = [[]], rowWidth = 0;
    widths.forEach((w, i) => {
      rowWidth + w > width && rows[rows.length - 1].length && (rows.push([]), rowWidth = 0), rows[rows.length - 1].push(i), rowWidth += w;
    }), rows.forEach((row, r) => {
      let totalW = row.reduce((s, i) => s + widths[i], 0), startX = originX;
      options.align === "right" ? startX = originX + width - totalW : options.align !== "left" && (startX = originX + (width - totalW) / 2);
      let cx = startX, rowY = y + r * ROW_H;
      for (let i of row)
        this.drawItem(g, items[i], i, cx, rowY), cx += widths[i];
    });
  }
  renderVertical(g) {
    let { items, x, y } = this.cfg;
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
    let data = entry.data;
    if (!Array.isArray(data)) {
      add("series.data.required", "error", `${base}.data`, "Series data must be an array.");
      return;
    }
    data.length === 0 && add("series.data.empty", "warning", `${base}.data`, "This series has no data points.");
    let yAxisIndex = entry.yAxis ?? 0, validYAxisIndex = typeof yAxisIndex == "number" && Number.isInteger(yAxisIndex) && yAxisIndex >= 0 && yAxisIndex < yAxes.length;
    validYAxisIndex || add("series.y_axis.index", "error", `${base}.yAxis`, `yAxis index must reference one of ${yAxes.length} configured axes.`), (yAxes[validYAxisIndex ? yAxisIndex : 0] ?? {}).type === "log" && dataValues(data).some((value) => value <= 0) && add("axis.log.non_positive", "error", `${base}.data`, "Logarithmic axes require strictly positive values.");
    let xAxisIndex = entry.xAxis ?? 0, validXAxisIndex = typeof xAxisIndex == "number" && Number.isInteger(xAxisIndex) && xAxisIndex >= 0 && xAxisIndex < xAxes.length;
    if (validXAxisIndex || add("series.x_axis.index", "error", `${base}.xAxis`, `xAxis index must reference one of ${xAxes.length} configured axes.`), (xAxes[validXAxisIndex ? xAxisIndex : 0] ?? {}).type === "log" && data.some((point, index) => {
      let x = pointX(point, index);
      return typeof x == "number" && x <= 0;
    }) && add("axis.log.non_positive_x", "error", `${base}.data`, "Logarithmic x-axes require strictly positive x values."), type === "histogram" && entry.bins !== void 0 && (typeof entry.bins != "number" || !Number.isSafeInteger(entry.bins) || entry.bins <= 0) && add("histogram.bins.positive_integer", "error", `${base}.bins`, "Histogram bins must be a positive integer."), ["pie", "donut", "funnel", "radialbar", "sunburst"].includes(type) && data.some((point) => (pointValue(point) ?? 1) < 0) && add("series.value.non_negative", "error", `${base}.data`, `${type} values cannot be negative.`), ["arearange", "areasplinerange", "columnrange", "errorbar"].includes(type) && validateRanges(data, base, add), type === "boxplot" && validateBoxplots(data, base, add), type === "candlestick" && validateCandlesticks(data, base, add), type === "gantt" && validateGantt(data, base, add), type === "sankey" && validateSankey(data, base, add), (type === "treegraph" || type === "sunburst") && validateHierarchy(data, base, add), type === "gauge") {
      let min = numberAt(entry, "min") ?? 0, max = numberAt(entry, "max") ?? 100;
      min >= max && add("gauge.range.order", "error", base, "Gauge min must be smaller than max.");
      let value = pointValue(data[0]);
      value !== void 0 && (value < min || value > max) && add("gauge.value.outside_range", "warning", `${base}.data[0]`, `Gauge value ${value} is outside ${min}\u2013${max} and will be clamped.`);
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
  return (Array.isArray(value) ? value : [value ?? {}]).map((axis, index) => {
    let axisPath = Array.isArray(value) ? `${path}[${index}]` : path;
    return isRecord(axis) ? (axis.min !== void 0 && typeof axis.min != "number" && add("axis.min.number", "error", `${axisPath}.min`, "Axis min must be a number."), axis.max !== void 0 && typeof axis.max != "number" && add("axis.max.number", "error", `${axisPath}.max`, "Axis max must be a number."), typeof axis.min == "number" && typeof axis.max == "number" && axis.min >= axis.max && add("axis.range.order", "error", axisPath, "Axis min must be smaller than max."), axis.type !== void 0 && !["linear", "log", "category", "datetime"].includes(String(axis.type)) && add("axis.type.unknown", "error", `${axisPath}.type`, `Unknown axis type ${describe(axis.type)}.`), axis) : (add("axis.object", "error", axisPath, "Axis configuration must be an object."), {});
  });
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

// src/core/chart.ts
var FacetViz = class _FacetViz {
  constructor(container, options) {
    this.events = new EventEmitter();
    this.series = [];
    this.destroyed = !1;
    this.boostHoverCleanups = [];
    /** Play the enter animation on the next render (first render + data updates). */
    this.animateNext = !0;
    /** Rendered SVG data marks in keyboard-navigation order. */
    this.accessiblePoints = [];
    this.clipSeq = 0;
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
    this.container = el, enforceConfiguredValidation(options), this.userOptions = merge({}, options), this.options = resolveChartOptions(this.userOptions), this.theme = resolveTheme(this.options.theme), this.colors = this.options.chart?.colors ?? this.options.colors ?? this.theme.colors, this.width = this.options.chart?.width ?? (this.container.clientWidth || 640), this.height = this.options.chart?.height ?? (this.container.clientHeight || 400), this.build(), this.render(), this.setupReflow(), typeof requestAnimationFrame < "u" && (this.initialReflowFrame = requestAnimationFrame(() => {
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
    let categories = resolveCategories(
      this.options.series,
      this.options.xAxis
    );
    this.series = this.options.series.map((opts, i) => {
      let s = createSeries(opts.type ?? "line", opts, categories);
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
   * Drop the axis lines themselves once the container gets too small to
   * read comfortably — leaving just gridlines and the series geometry —
   * rather than rendering an unreadably cramped chart. Data labels, axis
   * labels/titles, and the legend are no longer part of this degradation;
   * they render at whatever size the chart is. Overrides `this.options`
   * (mutable per-instance state) for the duration of this render only;
   * returns a function that restores the originals.
   */
  applyResponsiveOverrides() {
    if (this.options.chart?.responsive === !1) return () => {
    };
    if (!(Math.min(this.width, this.height) < 110)) return () => {
    };
    let patch = { lineWidth: 0 }, overrideAxis = (a) => Array.isArray(a) ? a.map((ax) => ({ ...ax, ...patch })) : { ...a ?? {}, ...patch }, originalX = this.options.xAxis, originalY = this.options.yAxis;
    return this.options.xAxis = overrideAxis(originalX), this.options.yAxis = overrideAxis(originalY), () => {
      this.options.xAxis = originalX, this.options.yAxis = originalY;
    };
  }
  render() {
    if (this.destroyed) return;
    let restoreResponsive = this.applyResponsiveOverrides();
    try {
      this.boostHoverCleanups.forEach((cleanup) => cleanup()), this.boostHoverCleanups = [], this.accessiblePoints = [], this.renderer ? (this.renderer.clear(), this.renderer.setSize(this.width, this.height)) : (this.renderer = new Renderer(this.width, this.height), this.renderer.mount(this.container)), applyTheme(this.theme), this.renderer.create(
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
      let spacing = this.options.chart?.spacing ?? [5, 5, 5, 5], top = spacing[0];
      top += this.renderTitles(top);
      let legendItems = this.buildLegendItems(), showLegend = this.options.legend?.enabled !== !1 && legendItems.length > 1, legendPlace = this.legendPlacement(), legendVertical = legendPlace === "left" || legendPlace === "right", legendReserveH = 0, legendReserveW = 0;
      showLegend && (legendVertical ? legendReserveW = Legend.verticalWidth(legendItems) : legendReserveH = LAYOUT.legendHeight);
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
      else if (t && (t.columns || t.rows) && t.table !== !1)
        this.renderTrellisTable(outer, t);
      else {
        let panels = this.computePanels(outer);
        for (let panel of panels) this.renderPanel(panel);
      }
      if (showLegend) {
        let lx = outer.x, ly = outer.y + outer.height + 14, lw = outer.width, lh = LAYOUT.legendHeight;
        legendPlace === "top" ? ly = top + 12 : legendPlace === "left" ? (lx = spacing[3], ly = outer.y, lw = legendReserveW, lh = outer.height) : legendPlace === "right" && (lx = outer.x + outer.width + 8, ly = outer.y, lw = legendReserveW, lh = outer.height), new Legend({
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
      this.applyAccessibility(), this.installZoom(outer), this.drawDrillUp(outer), this.animateNext && this.animateEnter(), this.animateNext = !1, this.events.emit("render", this), this.options.chart?.events?.render?.(this);
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
  renderTitles(top) {
    let used = 0, title = this.options.title;
    if (title?.text) {
      let x = this.titleX(title.align);
      this.renderer.text(
        title.text,
        x,
        top + 20,
        {
          "text-anchor": this.anchor(title.align),
          ...FONTS.title,
          ...sanitizeStyle(title.style)
        },
        this.renderer.root
      ), used += LAYOUT.titleHeight;
    }
    let sub = this.options.subtitle;
    if (sub?.text) {
      let x = this.titleX(sub.align);
      this.renderer.text(
        sub.text,
        x,
        top + used + 16,
        {
          "text-anchor": this.anchor(sub.align),
          ...FONTS.subtitle
        },
        this.renderer.root
      ), used += LAYOUT.subtitleHeight;
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
  catLabelWidth(visible) {
    return (this.currentCategories(visible) ?? []).reduce((m, c) => Math.max(m, String(c).length), 0) * 6.6;
  }
  /** Estimated px width of the widest value-axis label. */
  valueLabelWidth(visible, valOpts) {
    let [dmin, dmax] = this.valueDomain(visible), fmt = (v) => {
      if (valOpts.labels?.formatter) return String(valOpts.labels.formatter(v));
      let r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
      return String(r);
    };
    return Math.max(
      fmt(dmin).length,
      fmt(dmax).length,
      fmt((dmin + dmax) / 2).length
    ) * 6.6;
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
    let shortSide = Math.min(this.width, this.height);
    return Math.max(0, Math.min(1, (300 - shortSide) / 200)) * maxReduce;
  }
  axisReserve(opts, side, labelW) {
    if (opts.visible === !1) return 6;
    let title = opts.title?.text ? 1 : 0, labelsOn = opts.labels?.enabled !== !1;
    if (side === "left" || side === "right") {
      if (!labelsOn) return LAYOUT.tickLength + 6 + (title ? 18 : 0);
      let floor = title ? LAYOUT.defaultLeftAxisWidth : LAYOUT.defaultLeftAxisWidth - this.smallChartTaper(14);
      return Math.max(floor, LAYOUT.tickLength + 8 + labelW + (title ? 18 : 0));
    }
    let rot = opts.labels?.rotation ?? 0, rotExtra = rot ? Math.abs(Math.sin(rot * Math.PI / 180)) * labelW : 0;
    return labelsOn ? (title ? LAYOUT.defaultBottomAxisHeight : LAYOUT.defaultBottomAxisHeight - this.smallChartTaper(10)) + (title ? 8 : 0) + rotExtra : title ? LAYOUT.tickLength + 22 + 8 : LAYOUT.tickLength + 6;
  }
  renderPanel(panel) {
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
    ), plot = { ...plot, y: plot.y + 20, height: plot.height - 20 }), !cartesian) {
      this.renderPolarPanel(plot, visible);
      return;
    }
    let catOpts = firstAxis(this.options.xAxis) ?? {}, valOpts = axisAt(this.options.yAxis, 0), catSide = inverted ? catOpts.opposite ? "right" : "left" : catOpts.opposite ? "top" : "bottom", valSide = inverted ? valOpts.opposite ? "top" : "bottom" : valOpts.opposite ? "right" : "left", onSecondary = (s) => (s.options.yAxis ?? 0) === 1, renderSecondary = !inverted && valSide !== "right" && visible.some(onSecondary), valOpts2 = renderSecondary ? axisAt(this.options.yAxis, 1) : void 0, catReserve = this.axisReserve(
      catOpts,
      catSide,
      this.catLabelWidth(visible)
    ), valReserve = this.axisReserve(
      valOpts,
      valSide,
      this.valueLabelWidth(visible, valOpts)
    ), pad = { left: 8, right: 8, top: 6, bottom: 6 };
    pad[catSide] = catReserve, pad[valSide] = valReserve, renderSecondary && valOpts2 && (pad.right = this.axisReserve(
      valOpts2,
      "right",
      this.valueLabelWidth(visible.filter(onSecondary), valOpts2)
    ));
    let axisPlot = {
      x: plot.x + pad.left,
      y: plot.y + pad.top,
      width: plot.width - pad.left - pad.right,
      height: plot.height - pad.top - pad.bottom
    };
    computeStacks(visible);
    let { xScale, yScale, yScale2 } = this.buildScales(
      visible,
      axisPlot,
      inverted
    ), group = this.groupInfo(visible), catScale = inverted ? yScale : xScale, valScale = inverted ? xScale : yScale, axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    ), isSlope = visible.length > 0 && visible.every((s) => s.type === "slope"), catAxis = new Axis({
      renderer: this.renderer,
      scale: catScale,
      position: catSide,
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
    let valAxis = new Axis({
      renderer: this.renderer,
      scale: valScale,
      position: valSide,
      plot: axisPlot,
      options: isSlope ? { ...valOpts, lineWidth: 0 } : valOpts,
      grid: !isSlope
    });
    valAxis.render(axisLayer);
    let valAxis2;
    renderSecondary && valOpts2 && yScale2 && (valAxis2 = new Axis({
      renderer: this.renderer,
      scale: yScale2,
      position: "right",
      plot: axisPlot,
      options: valOpts2,
      grid: !1
    }), valAxis2.render(axisLayer)), this.plotCtx = { plot: axisPlot, xScale, yScale, inverted }, this.zoomState = inverted ? void 0 : { plot: axisPlot, xScale, yScale };
    let yScaleFor = (s) => yScale2 && onSecondary(s) ? yScale2 : yScale, cctx = !inverted && this.boostEnabled(visible) ? this.createBoostCanvas(axisPlot) : null, hits = [], existing = new Set(this.renderer.root.children);
    for (let s of visible) {
      let sy = yScaleFor(s);
      if (cctx && this.isBoostable(s))
        this.drawBoostSeries(s, cctx, xScale, sy, hits);
      else {
        let ctx = this.seriesContext(
          s,
          axisPlot,
          xScale,
          sy,
          group,
          inverted,
          !1
        );
        s.render(ctx);
      }
    }
    this.clipToPlot(axisPlot, existing), cctx && this.installBoostHover(axisPlot, hits);
    let aboveLayer = this.renderer.group(
      { class: "facet-axes-above" },
      this.renderer.root
    );
    catAxis.renderAbove(aboveLayer), valAxis.renderAbove(aboveLayer), valAxis2?.renderAbove(aboveLayer);
  }
  /** Clip the series groups added since `existing` was captured to the plot rect. */
  clipToPlot(plot, existing) {
    let NS = "http://www.w3.org/2000/svg", root = this.renderer.root, defs = root.querySelector("defs");
    defs || (defs = document.createElementNS(NS, "defs"), root.insertBefore(defs, root.firstChild));
    let id = `facet-clip-${++this.clipSeq}`, cp = document.createElementNS(NS, "clipPath");
    cp.setAttribute("id", id);
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
          c.lineTo(pts[pts.length - 1].x, zeroY), c.lineTo(pts[0].x, zeroY), c.closePath(), c.fillStyle = alpha(color, 0.25), c.fill();
        }
        c.strokeStyle = color, c.lineWidth = s.options.lineWidth ?? 2, c.lineJoin = "round", c.stroke();
        for (let p of raw)
          hits.push({ x: p.x, y: p.y, point: p.point, series: s });
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
      let zs = s.type === "bubble" ? s.points.map((p) => p.options.z ?? 1) : [], [zMin, zMax] = extent(zs), [rMin, rMax] = s.options.sizeRange ?? [3, 22], rng = seededRandom(s.index * 7919 + s.points.length + 1), jitterBand = xScale instanceof CategoryScale ? xScale.bandwidth() : 0, jitterSpread = (s.options.jitter ?? 0.5) * jitterBand;
      c.fillStyle = alpha(color, 0.6);
      for (let p of s.points) {
        if (p.y === void 0) continue;
        let px = xScale.scale(p.x), py = yScale.scale(p.y);
        s.type === "jitter" && jitterBand > 0 && (px += (rng() - 0.5) * jitterSpread);
        let r = s.options.marker?.radius ?? 3;
        if (s.type === "bubble") {
          let t = zMax === zMin ? 1 : ((p.options.z ?? 1) - zMin) / (zMax - zMin);
          r = Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin));
        }
        c.beginPath(), c.arc(px, py, r, 0, Math.PI * 2), c.fill(), hits.push({ x: px, y: py, point: p, series: s });
      }
    }
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
    let [vMin, vMax] = this.valueDomain(
      primaryVisible.length ? primaryVisible : allVisible
    );
    if ((primaryVisible.length ? primaryVisible : allVisible).some(
      (s) => ["column", "bar", "area", "areaspline", "lollipop"].includes(s.type)
    ) && (vMin = Math.min(vMin, 0), vMax = Math.max(vMax, 0)), yOpts0.max === void 0) {
      let span = vMax - vMin || Math.abs(vMax) || 1;
      vMax += span * 0.08;
    }
    let vMin2 = 0, vMax2 = 1;
    if (hasSecondary && yOpts1 && ([vMin2, vMax2] = this.valueDomain(secondaryVisible), secondaryVisible.some(
      (s) => ["column", "bar", "area", "areaspline", "lollipop"].includes(s.type)
    ) && (vMin2 = Math.min(vMin2, 0), vMax2 = Math.max(vMax2, 0)), yOpts1.max === void 0)) {
      let span2 = vMax2 - vMin2 || Math.abs(vMax2) || 1;
      vMax2 += span2 * 0.08;
    }
    let dimNameRowH = 16, rowValueColW = rowDim ? Math.max(
      32,
      Math.max(
        rowDim.length,
        ...rowVals.filter((v) => v !== void 0).map((v) => String(v).length),
        0
      ) * 6.6 + 4
    ) : 0, titleReserveLeft = (inverted ? xOpts.title?.text : yOpts0.title?.text) ? 18 : 0, tickLabelW = LAYOUT.tickLength + 8 + (inverted ? this.catLabelWidth(allVisible) : this.valueLabelWidth(
      primaryVisible.length ? primaryVisible : allVisible,
      yOpts0
    )), colHeaderH = colDim ? dimNameRowH + 20 : rowDim ? dimNameRowH : 0, rowHeaderW = rowDim ? rowValueColW : 0, leftReserve = rowHeaderW + tickLabelW + titleReserveLeft, titleReserveRight = hasSecondary && yOpts1?.title?.text ? 18 : 0, rightReserve = hasSecondary && yOpts1 ? LAYOUT.tickLength + 8 + this.valueLabelWidth(secondaryVisible, yOpts1) + titleReserveRight : 0, bottomReserve = LAYOUT.defaultBottomAxisHeight, gridX = outer.x + leftReserve, gridY = outer.y + colHeaderH, gridW = outer.width - leftReserve - rightReserve, gridH = outer.height - colHeaderH - bottomReserve, cellW = (gridW - gap * (colVals.length - 1)) / colVals.length, cellH = (gridH - gap * (rowVals.length - 1)) / rowVals.length, lineColor = THEME.axis.lineColor, headerLayer = this.renderer.group(
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
          this.valueScale(yOpts0, [vMin, vMax], valRange),
          valRange
        ), valScale2 = hasSecondary && yOpts1 ? dropLastTick(
          this.valueScale(
            yOpts1,
            [vMin2, vMax2],
            [cell.y + cell.height, cell.y]
          ),
          [cell.y + cell.height, cell.y]
        ) : void 0, xScale = inverted ? valScale : catScale, yScale = inverted ? catScale : valScale, yScale2 = valScale2, axisLayer = this.renderer.group(
          { class: "facet-axes" },
          this.renderer.root
        ), isLeft = ci === 0, isRight = ci === colVals.length - 1, isBottom = ri === rowVals.length - 1, catLabelled = inverted ? isLeft : isBottom, valLabelled = inverted ? isBottom : isLeft, catAxis = new Axis({
          renderer: this.renderer,
          scale: catScale,
          position: inverted ? "left" : "bottom",
          plot: cell,
          grid: !!xOpts.gridLineWidth,
          options: catLabelled ? { ...xOpts, title: void 0, ticks: !1 } : { labels: { enabled: !1 }, lineWidth: 0, ticks: !1 }
        });
        catAxis.render(axisLayer);
        let valAxis = new Axis({
          renderer: this.renderer,
          scale: valScale,
          position: inverted ? "bottom" : "left",
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
    let dummy = new LinearScale({ domain: [0, 1], range: [0, 1] });
    for (let s of visible) {
      let ctx = this.seriesContext(
        s,
        plot,
        dummy,
        dummy,
        { count: 1, index: /* @__PURE__ */ new Map() },
        !1,
        !0
      );
      s.render(ctx);
    }
  }
  // -- Nested (hierarchical x-axis) ------------------------------
  renderNestedPanel(outer, visible, dims) {
    if (!visible.length) return;
    let agg = firstAxis(this.options.xAxis)?.aggregate ?? "sum", { leaves, keys, seriesPoints } = this.buildNested(visible, dims, agg);
    if (!keys.length) return;
    let aggSeries = visible.map(
      (s) => s.withPoints(seriesPoints.get(s.index) ?? [])
    ), inverted = this.isInverted(visible), yOpts0 = axisAt(this.options.yAxis, 0), yOpts1 = axisAt(this.options.yAxis, 1), onAxis = (s, i) => (s.options.yAxis ?? 0) === i, secondary = aggSeries.filter((s) => onAxis(s, 1)), hasSecondary = !inverted && secondary.length > 0, xOpts = firstAxis(this.options.xAxis) ?? {}, split = !!xOpts.opposite, catVisible = xOpts.visible !== !1, rowH = 18, rotExtra = inverted ? 0 : nestedInnerRotationExtent(leaves, xOpts.labels?.rotation ?? 0), plot, catScale, valScale0, valScale1, axisLayer = this.renderer.group(
      { class: "facet-axes" },
      this.renderer.root
    ), valAxis0, valAxis1;
    if (inverted) {
      let colWidths = nestedLevelWidths(leaves), innerW = colWidths[colWidths.length - 1] ?? 0, outerW = colWidths.slice(0, -1).reduce((a, b) => a + b, 0), totalW = colWidths.reduce((a, b) => a + b, 0), leftReserve = catVisible ? LAYOUT.tickLength + 8 + (split ? innerW : totalW) : 6, rightReserve = catVisible && split ? LAYOUT.tickLength + 8 + outerW : 8, bottomReserve = LAYOUT.defaultBottomAxisHeight + (yOpts0.title?.text ? 32 : 0), topReserve = 6;
      plot = {
        x: outer.x + leftReserve,
        y: outer.y + topReserve,
        width: outer.width - leftReserve - rightReserve,
        height: outer.height - topReserve - bottomReserve
      }, catScale = new CategoryScale({
        categories: keys,
        range: [plot.y, plot.y + plot.height]
      });
      let [lo, hi] = this.valueDomain(aggSeries);
      lo = Math.min(lo, 0), hi = Math.max(hi, 0), valScale0 = this.valueScale(
        yOpts0,
        [lo, hi],
        [plot.x, plot.x + plot.width]
      ), valScale1 = valScale0, valAxis0 = new Axis({
        renderer: this.renderer,
        scale: valScale0,
        position: "bottom",
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
        labels: xOpts.labels,
        lineWidth: xOpts.lineWidth,
        gridLineWidth: xOpts.gridLineWidth
      }).render(axisLayer);
    } else {
      let leftReserve = LAYOUT.tickLength + 8 + this.valueLabelWidth(
        aggSeries.filter((s) => onAxis(s, 0)),
        yOpts0
      ) + (yOpts0.title?.text ? 18 : 0), rightReserve = hasSecondary ? LAYOUT.tickLength + 8 + this.valueLabelWidth(secondary, yOpts1) + (yOpts1.title?.text ? 18 : 0) : 8, bottomReserve = catVisible ? LAYOUT.tickLength + (split ? 1 : dims.length) * rowH + 12 + rotExtra : 6, topReserve = catVisible && split ? LAYOUT.tickLength + (dims.length - 1) * rowH + 8 : 6;
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
        let [lo, hi] = this.valueDomain(list.length ? list : aggSeries);
        return lo = Math.min(lo, 0), hi = Math.max(hi, 0), this.valueScale(opts, [lo, hi], range);
      };
      valScale0 = scaleFor(
        aggSeries.filter((s) => onAxis(s, 0)),
        yOpts0
      ), valScale1 = hasSecondary ? scaleFor(secondary, yOpts1) : valScale0, valAxis0 = new Axis({
        renderer: this.renderer,
        scale: valScale0,
        position: "left",
        plot,
        options: yOpts0,
        grid: !0
      }), valAxis0.render(axisLayer), hasSecondary && (valAxis1 = new Axis({
        renderer: this.renderer,
        scale: valScale1,
        position: "right",
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
        labels: xOpts.labels,
        lineWidth: xOpts.lineWidth,
        gridLineWidth: xOpts.gridLineWidth
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
    let bottomReserve = LAYOUT.defaultBottomAxisHeight, gutter = 84, plot = {
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
      grid: !1,
      plot: { x: plot.x, y: plot.y, width: halfW, height: plot.height },
      options: { ...yOpts, title: void 0 }
    });
    leftAxis.render(axisLayer);
    let rightAxis = new Axis({
      renderer: this.renderer,
      scale: rightVal,
      position: "bottom",
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
          "stroke-width": 2
        },
        g
      ), pts.forEach((p, i) => {
        let point = s.points.find((pp) => String(pp.x) === String(cats[i])) ?? s.points[i];
        if (!point) return;
        let el = this.renderer.create(
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
        this.bindPointInteraction(el, s, point), el.addEventListener(
          "click",
          (e) => this.handlePointEvent("click", s, point, e)
        );
      });
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
        )), h > 16 && w > 26 && val > 0 && this.renderer.text(
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
        ), y += h;
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
  buildScales(visible, plot, inverted) {
    let categories = this.currentCategories(visible), xAxisOpts = firstAxis(this.options.xAxis) ?? {}, yAxisOpts = axisAt(this.options.yAxis, 0), onSecondary = (s) => (s.options.yAxis ?? 0) === 1, hasSecondary = !inverted && visible.some(onSecondary), primaryVisible = hasSecondary ? visible.filter((s) => !onSecondary(s)) : visible, [vMin, vMax] = this.valueDomain(
      primaryVisible.length ? primaryVisible : visible
    );
    primaryVisible.some(
      (s) => ["column", "bar", "area", "areaspline", "errorbar", "lollipop"].includes(
        s.type
      )
    ) && (inverted ? xAxisOpts : yAxisOpts).type !== "log" && (vMin = Math.min(vMin, 0), vMax = Math.max(vMax, 0));
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
      let valueAxisOpts = inverted ? xAxisOpts : yAxisOpts, valuePx = inverted ? plot.width : plot.height, padY = markerR / Math.max(1, valuePx) * (vMax - vMin || 1);
      valueAxisOpts.min === void 0 && (vMin -= padY), valueAxisOpts.max === void 0 && (vMax += padY);
    }
    if (primaryVisible.some((s) => {
      let dl = s.options.dataLabels;
      return dl?.enabled ? dl.position === void 0 || dl.position === "outside" || dl.position === "top" : !1;
    })) {
      let valueAxisOpts = inverted ? xAxisOpts : yAxisOpts, valuePx = inverted ? plot.width : plot.height, padY = 18 / Math.max(1, valuePx) * (vMax - vMin || 1);
      valueAxisOpts.max === void 0 && (vMax += padY);
    }
    let datetime = xAxisOpts.type === "datetime" && !categories, xNumeric = (range, reversed) => {
      let [dmin, dmax] = this.xNumericDomain(visible), min = xAxisOpts.min ?? dmin, max = xAxisOpts.max ?? dmax;
      if (markerR) {
        let padX = markerR / Math.max(1, plot.width) * (max - min || 1);
        xAxisOpts.min === void 0 && (min -= padX), xAxisOpts.max === void 0 && (max += padX);
      }
      if (datetime) {
        let { ticks, format } = niceDateTicks(min, max);
        return new LinearScale({
          domain: [min, max],
          range,
          reversed,
          ticks,
          format: (v) => formatDate(v, format),
          nice: xAxisOpts.min === void 0 && xAxisOpts.max === void 0
        });
      }
      return new LinearScale({
        domain: [min, max],
        range,
        ...reversed ? { reversed } : {},
        nice: xAxisOpts.min === void 0 && xAxisOpts.max === void 0
      });
    }, catScale = (range, reversed) => categories ? new CategoryScale({ categories, range, reversed }) : xNumeric(range, reversed);
    if (inverted) {
      let xScale2 = this.valueScale(
        xAxisOpts,
        [vMin, vMax],
        [plot.x, plot.x + plot.width]
      ), yScale3 = categories ? new CategoryScale({
        categories,
        range: [plot.y, plot.y + plot.height]
      }) : new LinearScale({
        domain: this.xNumericDomain(visible),
        range: [plot.y + plot.height, plot.y]
      });
      return { xScale: xScale2, yScale: yScale3 };
    }
    let xScale = catScale([plot.x, plot.x + plot.width], xAxisOpts.reversed), yScale = this.valueScale(
      yAxisOpts,
      [vMin, vMax],
      [plot.y + plot.height, plot.y]
    ), yScale2;
    if (hasSecondary) {
      let secondaryVisible = visible.filter(onSecondary), [vMin2, vMax2] = this.valueDomain(secondaryVisible);
      secondaryVisible.some(
        (s) => [
          "column",
          "bar",
          "area",
          "areaspline",
          "errorbar",
          "lollipop"
        ].includes(s.type)
      ) && axisAt(this.options.yAxis, 1).type !== "log" && (vMin2 = Math.min(vMin2, 0), vMax2 = Math.max(vMax2, 0)), yScale2 = this.valueScale(
        axisAt(this.options.yAxis, 1),
        [vMin2, vMax2],
        [plot.y + plot.height, plot.y]
      );
    }
    return { xScale, yScale, yScale2 };
  }
  valueScale(opts, domain, range) {
    let min = opts.min ?? domain[0], max = opts.max ?? domain[1];
    if (opts.type === "log") return new LogScale({ domain: [min, max], range });
    let span = Math.abs(range[1] - range[0]), tickCount = opts.tickCount ?? (span < 100 ? 3 : span < 200 ? 4 : 6);
    return new LinearScale({
      domain: [min, max],
      range,
      tickCount,
      nice: opts.min === void 0 && opts.max === void 0
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
      "lollipop"
    ]);
  }
  currentCategories(visible) {
    let xAxis = firstAxis(this.options.xAxis);
    if (xAxis?.categories) return xAxis.categories;
    let banded = xAxis?.type !== "datetime" && visible.some((s) => _FacetViz.BANDED.has(s.type));
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
      let key = s.options.stacking ? `stack:${s.options.stack ?? "default"}` : `series:${s.index}`, ci = columnKeys.indexOf(key);
      ci === -1 && (ci = columnKeys.length, columnKeys.push(key)), index.set(s.index, ci);
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
      registerHover: (el, p) => this.bindPointInteraction(el, s, p)
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
      this.tooltip.show(build(), s.options.tooltip), this.showCrosshair(p);
    }), el.addEventListener(
      "mousemove",
      (e) => this.tooltip.move(e.clientX, e.clientY)
    ), el.addEventListener("mouseleave", () => {
      this.tooltip.hide(), this.hideCrosshair();
    }), this.options.accessibility?.enabled !== !1 && this.options.accessibility?.keyboardNavigation !== !1 && (el.addEventListener("focus", () => {
      this.tooltip.show(build(), s.options.tooltip);
      let rect = el.getBoundingClientRect();
      this.tooltip.move(rect.left + rect.width / 2, rect.top + rect.height / 2), this.showCrosshair(p);
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
  showCrosshair(p) {
    let ctx = this.plotCtx;
    if (!firstAxis(this.options.xAxis)?.crosshair || !ctx || ctx.inverted)
      return;
    this.hideCrosshair();
    let x = ctx.xScale.scale(p.x);
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
      first.onLegendToggle(index), this.render();
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
   * (pie/donut/radialbar) are always exactly one series internally, with one
   * entry per slice here — so check `legendItems.length`/`hasLegend` instead
   * of `options.series.length` to decide whether a legend is meaningful.
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
export {
  BaseSeries,
  CategoryScale,
  FacetViz as Chart,
  ChartValidationError,
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
  isSeriesTypeRegistered,
  registerAllSeries,
  registerSeriesType,
  registerSeriesTypes,
  registerTheme,
  resolveTheme,
  validateChartOptions
};
