/** Small, self-contained helpers shared across modules. */

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge `source` into a copy of `target`. Arrays are replaced wholesale. */
export function merge<T>(target: T, ...sources: Array<Partial<T> | undefined>): T {
  const out: any = Array.isArray(target) ? [...(target as any)] : { ...(target as any) };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      const sv = (source as any)[key];
      const tv = out[key];
      if (isObject(sv) && isObject(tv)) {
        out[key] = merge(tv, sv);
      } else if (sv !== undefined) {
        out[key] = sv;
      }
    }
  }
  return out as T;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Sum an array of numbers, ignoring null/undefined. */
export function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) if (typeof v === 'number' && !Number.isNaN(v)) total += v;
  return total;
}

export function extent(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return [0, 1];
  return [min, max];
}

/**
 * Min/max decimation for dense lines. Points are bucketed by their x-pixel
 * column; each column keeps its first, min-y, max-y and last point (in x order)
 * so peaks and troughs survive. Reduces an N-point line to ~4× the pixel width
 * with a near-identical silhouette. `pts` should be in pixel space, x-sorted.
 */
export function decimateLine<T extends { x: number; y: number }>(pts: T[], targetPerColumn = 1): T[] {
  if (pts.length < 400) return pts;
  const out: T[] = [];
  let colX = Math.round(pts[0].x / targetPerColumn);
  let first: T | null = null, last: T | null = null, min: T | null = null, max: T | null = null;
  const flush = () => {
    if (!first) return;
    const chosen = [first, min!, max!, last!].filter((p, i, a) => a.indexOf(p) === i).sort((a, b) => a.x - b.x);
    out.push(...chosen);
  };
  for (const p of pts) {
    const cx = Math.round(p.x / targetPerColumn);
    if (cx !== colX) { flush(); colX = cx; first = min = max = last = null; }
    if (!first) first = p;
    if (!min || p.y < min.y) min = p;
    if (!max || p.y > max.y) max = p;
    last = p;
  }
  flush();
  return out;
}

/** Deterministic pseudo-random in [0,1) from a seed — used for jitter. */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Replace `{token}` placeholders in a format string.
 *
 * Supports:
 *  - dotted paths — `{point.name}`, `{point.meta.owner}`
 *  - number format specifiers after a colon — `{y:,.1f}`, `{y:.0%}`,
 *    `{y:$,.2f}`, `{value:.2s}` (see {@link formatValue})
 *  - date format specifiers — `{x:%Y-%m-%d}` when the value is a Date/timestamp
 */
export function formatString(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{([^{}:]+)(?::([^{}]*))?\}/g, (_, path: string, spec?: string) => {
    const value = resolvePath(ctx, path.trim());
    if (value === undefined || value === null) return '';
    if (spec !== undefined && spec !== '') {
      if (/%[a-zA-Z]/.test(spec)) return formatDate(value as string | number | Date, spec);
      if (typeof value === 'number') return formatValue(value, spec);
    }
    return String(value);
  });
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Group the integer part of a numeric string with a thousands separator. */
export function groupThousands(numStr: string, sep = ','): string {
  const neg = numStr.startsWith('-');
  const body = neg ? numStr.slice(1) : numStr;
  const [int, frac] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? '-' : '') + grouped + (frac !== undefined ? '.' + frac : '');
}

/** Abbreviate large numbers with an SI-style suffix (k, M, B, T). */
export function abbreviateNumber(value: number, decimals = 1): string {
  const units = [
    { v: 1e12, s: 'T' }, { v: 1e9, s: 'B' }, { v: 1e6, s: 'M' }, { v: 1e3, s: 'k' },
  ];
  const abs = Math.abs(value);
  for (const u of units) {
    if (abs >= u.v) return (value / u.v).toFixed(decimals).replace(/\.0+$/, '') + u.s;
  }
  return trimZeros(value.toFixed(decimals));
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Format a number against a compact, printf-style spec:
 *
 *   [prefix][,][.decimals][type][suffix]
 *
 *   type: `f` fixed · `%` percent (×100) · `s` SI-abbreviated · `e` exponential
 *         · `d` integer · (omitted) plain
 *
 * Examples: `,.0f` → `1,234` · `.1%` → `12.3%` · `$,.2f` → `$1,234.50`
 *           · `.2s` → `1.23M` · `.3e` → `1.235e+3`
 */
export function formatValue(value: number, spec: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  const m = /^([^,.\d%sfed]*)(,)?(?:\.(\d+))?([sfed%])?(.*)$/.exec(spec);
  if (!m) return String(value);
  const [, prefix = '', comma, decStr, type, suffix = ''] = m;
  const decimals = decStr !== undefined ? parseInt(decStr, 10) : undefined;

  let out: string;
  let unit = '';
  switch (type) {
    case '%': out = (value * 100).toFixed(decimals ?? 0); unit = '%'; break;
    case 's': out = abbreviateNumber(value, decimals ?? 1); break;
    case 'e': return `${prefix}${value.toExponential(decimals ?? 2)}${suffix}`;
    case 'd': out = Math.round(value).toString(); break;
    default: out = decimals !== undefined ? value.toFixed(decimals) : String(value);
  }
  if (comma && type !== 's') out = groupThousands(out);
  return `${prefix}${out}${unit}${suffix}`;
}

/** Format a number with optional decimals, prefix and suffix (legacy helper). */
export function formatNumber(
  value: number | undefined,
  opts: { decimals?: number; prefix?: string; suffix?: string; thousands?: boolean } = {},
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  let n = opts.decimals !== undefined ? value.toFixed(opts.decimals) : String(value);
  if (opts.thousands) n = groupThousands(n);
  return `${opts.prefix ?? ''}${n}${opts.suffix ?? ''}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Format a Date / timestamp with strftime-style tokens (`%Y-%m-%d %H:%M`). */
export function formatDate(value: string | number | Date, pattern: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const map: Record<string, string> = {
    Y: String(d.getFullYear()), y: p2(d.getFullYear() % 100),
    m: p2(d.getMonth() + 1), b: MONTHS[d.getMonth()].slice(0, 3), B: MONTHS[d.getMonth()],
    d: p2(d.getDate()), e: String(d.getDate()),
    H: p2(d.getHours()), M: p2(d.getMinutes()), S: p2(d.getSeconds()),
    a: DAYS[d.getDay()].slice(0, 3), A: DAYS[d.getDay()],
  };
  return pattern.replace(/%([A-Za-z])/g, (_, t: string) => map[t] ?? `%${t}`);
}

/**
 * Produce nice datetime ticks (timestamps) and a matching strftime format for
 * the span, so a `type: 'datetime'` axis reads with sensible date labels.
 */
export function niceDateTicks(min: number, max: number, count = 6): { ticks: number[]; format: string } {
  const span = max - min || 1;
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR, YEAR = 365 * DAY;
  let step: number, format: string, floor: (t: number) => number, next: (t: number) => number;

  if (span > 2 * YEAR) {
    format = '%Y';
    floor = (t) => new Date(new Date(t).getFullYear(), 0, 1).getTime();
    const yStep = Math.max(1, Math.ceil(span / YEAR / count));
    next = (t) => { const d = new Date(t); return new Date(d.getFullYear() + yStep, 0, 1).getTime(); };
    step = 0;
  } else if (span > 60 * DAY) {
    format = "%b %Y";
    floor = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
    const mStep = Math.max(1, Math.ceil(span / (30 * DAY) / count));
    next = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + mStep, 1).getTime(); };
    step = 0;
  } else if (span > 2 * DAY) {
    format = '%b %d';
    step = niceUnit(span / count, [DAY, 2 * DAY, 7 * DAY, 14 * DAY]);
    floor = (t) => Math.floor(t / DAY) * DAY;
    next = (t) => t + step;
  } else if (span > 2 * HOUR) {
    format = '%H:%M';
    step = niceUnit(span / count, [HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR]);
    floor = (t) => Math.floor(t / HOUR) * HOUR;
    next = (t) => t + step;
  } else {
    format = '%H:%M';
    step = niceUnit(span / count, [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN]);
    floor = (t) => Math.floor(t / MIN) * MIN;
    next = (t) => t + step;
  }

  const ticks: number[] = [];
  for (let t = floor(min); t <= max && ticks.length < 100; t = next(t)) {
    if (t >= min) ticks.push(t);
  }
  if (!ticks.length) ticks.push(min, max);
  return { ticks, format };
}

function niceUnit(target: number, choices: number[]): number {
  return choices.find((c) => c >= target) ?? choices[choices.length - 1];
}

/** Produce ~`count` "nice" tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (min === max) {
    // Degenerate range: fabricate a small window around the value.
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const span = niceNum(max - min, false);
  const step = niceNum(span / Math.max(1, count - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    // Guard against floating point dust like 0.30000000000000004.
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range || 1));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return niceFraction * Math.pow(10, exponent);
}
