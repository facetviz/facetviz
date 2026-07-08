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
 * Supports dotted paths, e.g. `{point.name}`.
 */
export function formatString(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const value = resolvePath(ctx, path.trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Format a number with optional decimals, prefix and suffix. */
export function formatNumber(
  value: number | undefined,
  opts: { decimals?: number; prefix?: string; suffix?: string } = {},
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  const n = opts.decimals !== undefined ? value.toFixed(opts.decimals) : String(value);
  return `${opts.prefix ?? ''}${n}${opts.suffix ?? ''}`;
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
