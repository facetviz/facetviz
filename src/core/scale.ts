/**
 * Scales map data values into pixel coordinates within a plot area.
 *
 * All scales share the {@link Scale} interface so axes and series can treat
 * them uniformly. `range` is always [pixelStart, pixelEnd]; for a vertical
 * (value) axis callers pass a reversed range so larger values sit higher.
 */

import { niceTicks } from './utils.js';

export interface Scale {
  /** Map a domain value to a pixel position. */
  scale(value: number | string): number;
  /** Tick values to render on an axis. */
  ticks(): Array<number | string>;
  /** Human label for a tick value. */
  tickLabel(value: number | string): string;
  /** Pixel width allotted to one band (category scales); 0 for continuous. */
  bandwidth(): number;
  /** The two pixel bounds. */
  range(): [number, number];
  /** Invert a pixel position back to (approximate) domain — for hit testing. */
  invert?(pixel: number): number;
}

export interface LinearScaleConfig {
  domain: [number, number];
  range: [number, number];
  tickCount?: number;
  reversed?: boolean;
  /** Provide explicit ticks to override the "nice" default. */
  ticks?: number[];
  format?: (v: number) => string;
  /** Expand an automatically-derived domain to its outer ticks (default true). */
  nice?: boolean;
  /** Override nicening for the lower bound independently. */
  niceMin?: boolean;
  /** Override nicening for the upper bound independently. */
  niceMax?: boolean;
}

export class LinearScale implements Scale {
  private d0: number;
  private d1: number;
  private r0: number;
  private r1: number;
  private tickValues: number[];
  private format?: (v: number) => string;

  constructor(cfg: LinearScaleConfig) {
    [this.d0, this.d1] = cfg.domain;
    [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range;
    this.format = cfg.format;
    this.tickValues = cfg.ticks ?? niceTicks(this.d0, this.d1, cfg.tickCount ?? 4);
    const niceByDefault = cfg.nice !== false;
    const niceMin = cfg.niceMin ?? niceByDefault;
    const niceMax = cfg.niceMax ?? niceByDefault;
    if (this.tickValues.length) {
      // Treat the two bounds independently. A caller can pin one edge while
      // allowing the automatically-derived edge to expand to a clean tick.
      // This avoids exposing a padded floating-point endpoint as an axis label.
      const firstTick = this.tickValues[0];
      const lastTick = this.tickValues[this.tickValues.length - 1];
      if (niceMin) this.d0 = Math.min(this.d0, firstTick);
      else this.tickValues = this.tickValues.filter((v) => v >= this.d0);

      if (niceMax) this.d1 = Math.max(this.d1, lastTick);
      else this.tickValues = this.tickValues.filter((v) => v <= this.d1);

      if (!niceMin && !this.tickValues.includes(this.d0))
        this.tickValues.unshift(this.d0);
      if (!niceMax && !this.tickValues.includes(this.d1))
        this.tickValues.push(this.d1);
    }
  }

  scale(value: number | string): number {
    const v = typeof value === 'number' ? value : parseFloat(value);
    const t = this.d1 === this.d0 ? 0 : (v - this.d0) / (this.d1 - this.d0);
    return this.r0 + t * (this.r1 - this.r0);
  }

  invert(pixel: number): number {
    const t = this.r1 === this.r0 ? 0 : (pixel - this.r0) / (this.r1 - this.r0);
    return this.d0 + t * (this.d1 - this.d0);
  }

  ticks(): number[] {
    return this.tickValues;
  }

  tickLabel(value: number | string): string {
    const v = typeof value === 'number' ? value : parseFloat(value);
    return this.format ? this.format(v) : String(v);
  }

  bandwidth(): number {
    return 0;
  }

  range(): [number, number] {
    return [this.r0, this.r1];
  }

  get domain(): [number, number] {
    return [this.d0, this.d1];
  }
}

export interface LogScaleConfig {
  domain: [number, number];
  range: [number, number];
  reversed?: boolean;
  format?: (v: number) => string;
  /** Expand the domain outward to the nearest tick (default false). */
  nice?: boolean;
  /** Override nicening for the lower bound independently. */
  niceMin?: boolean;
  /** Override nicening for the upper bound independently. */
  niceMax?: boolean;
}

/** Strip floating-point dust such as 3 * 0.1 = 0.30000000000000004. */
const cleanLog = (v: number) => Number(v.toPrecision(12));

/**
 * Candidate tick values covering [lo, hi] (both > 0), one step beyond each
 * end so a nice domain can snap outward. Wide ranges tick on powers of ten
 * (thinned to roughly eight labels); narrower ones fill each decade with
 * 1-2-5 or 1..9 multiples so the axis never ends up with a single label.
 */
function logTickCandidates(lo: number, hi: number): number[] {
  const e0 = Math.floor(Math.log10(lo));
  const e1 = Math.ceil(Math.log10(hi));
  const decades = Math.log10(hi) - Math.log10(lo);
  if (decades >= 2) {
    const step = Math.max(1, Math.ceil((e1 - e0) / 8));
    const out: number[] = [];
    for (let e = Math.floor(e0 / step) * step; e <= e1 + step; e += step)
      out.push(cleanLog(Math.pow(10, e)));
    return out;
  }
  const mantissas = decades >= 1 ? [1, 2, 5] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out: number[] = [];
  for (let e = e0 - 1; e <= e1; e++)
    for (const m of mantissas) out.push(cleanLog(m * Math.pow(10, e)));
  out.push(cleanLog(Math.pow(10, e1 + 1)));
  return out;
}

export class LogScale implements Scale {
  private l0: number;
  private l1: number;
  private r0: number;
  private r1: number;
  private tickValues: number[];
  private format?: (v: number) => string;

  constructor(cfg: LogScaleConfig) {
    let lo = cfg.domain[0] > 0 ? cfg.domain[0] : 1;
    let hi = cfg.domain[1] > 0 ? cfg.domain[1] : lo * 10;
    if (hi < lo) [lo, hi] = [hi, lo];
    if (hi === lo) {
      // Degenerate range: centre the value inside one decade.
      lo /= Math.sqrt(10);
      hi *= Math.sqrt(10);
    }
    const niceByDefault = cfg.nice === true;
    const niceMin = cfg.niceMin ?? niceByDefault;
    const niceMax = cfg.niceMax ?? niceByDefault;
    const candidates = logTickCandidates(lo, hi);
    const eps = 1e-9;
    if (niceMin) {
      const below = candidates.filter((t) => t <= lo * (1 + eps));
      if (below.length) lo = below[below.length - 1];
    }
    if (niceMax) {
      const above = candidates.find((t) => t >= hi * (1 - eps));
      if (above !== undefined) hi = above;
    }
    this.l0 = Math.log10(lo);
    this.l1 = Math.log10(hi);
    this.tickValues = candidates.filter(
      (t) => t >= lo * (1 - eps) && t <= hi * (1 + eps),
    );
    if (this.tickValues.length < 2) {
      // Too narrow for log ticks to say anything: fall back to linear ticks.
      this.tickValues = niceTicks(lo, hi, 4).filter(
        (t) => t > 0 && t >= lo * (1 - eps) && t <= hi * (1 + eps),
      );
    }
    [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range;
    this.format = cfg.format;
  }

  get domain(): [number, number] {
    return [Math.pow(10, this.l0), Math.pow(10, this.l1)];
  }

  scale(value: number | string): number {
    const v = typeof value === 'number' ? value : parseFloat(value);
    // log(0) is -infinity: anchor zero/negative values (a column's or area's
    // baseline) at the floor of the axis instead of far outside the plot.
    if (!(v > 0)) return this.r0;
    const t = (Math.log10(v) - this.l0) / (this.l1 - this.l0);
    return this.r0 + t * (this.r1 - this.r0);
  }

  invert(pixel: number): number {
    const t = this.r1 === this.r0 ? 0 : (pixel - this.r0) / (this.r1 - this.r0);
    return Math.pow(10, this.l0 + t * (this.l1 - this.l0));
  }

  ticks(): number[] {
    return this.tickValues;
  }

  tickLabel(value: number | string): string {
    const v = typeof value === 'number' ? value : parseFloat(value);
    return this.format ? this.format(v) : String(cleanLog(v));
  }

  bandwidth(): number {
    return 0;
  }

  range(): [number, number] {
    return [this.r0, this.r1];
  }
}

export interface CategoryScaleConfig {
  categories: Array<number | string>;
  range: [number, number];
  reversed?: boolean;
  /** Fraction of a band left as padding between bands (0..1). */
  padding?: number;
  format?: (v: number | string) => string;
}

export class CategoryScale implements Scale {
  private categories: Array<number | string>;
  private index = new Map<string, number>();
  private r0: number;
  private r1: number;
  private step: number;
  private pad: number;
  private format?: (v: number | string) => string;

  constructor(cfg: CategoryScaleConfig) {
    this.categories = cfg.reversed ? [...cfg.categories].reverse() : cfg.categories;
    this.categories.forEach((c, i) => this.index.set(String(c), i));
    [this.r0, this.r1] = cfg.range;
    this.pad = cfg.padding ?? 0.2;
    this.step = (this.r1 - this.r0) / Math.max(1, this.categories.length);
    this.format = cfg.format;
  }

  /** Returns the centre pixel of a category's band. */
  scale(value: number | string): number {
    const i = this.index.get(String(value));
    const idx = i === undefined ? Number(value) : i;
    return this.r0 + this.step * (idx + 0.5);
  }

  ticks(): Array<number | string> {
    return this.categories;
  }

  tickLabel(value: number | string): string {
    return this.format ? this.format(value) : String(value);
  }

  /** Usable width for a bar within a band (excludes padding). */
  bandwidth(): number {
    return Math.abs(this.step) * (1 - this.pad);
  }

  /** Full step including padding — used to position grouped bars. */
  fullStep(): number {
    return this.step;
  }

  range(): [number, number] {
    return [this.r0, this.r1];
  }
}
