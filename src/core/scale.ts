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
    this.tickValues = cfg.ticks ?? niceTicks(this.d0, this.d1, cfg.tickCount ?? 6);
    // Expand the domain so the outermost ticks sit on the axis ends.
    if (cfg.nice !== false && this.tickValues.length) {
      this.d0 = Math.min(this.d0, this.tickValues[0]);
      this.d1 = Math.max(this.d1, this.tickValues[this.tickValues.length - 1]);
    } else if (cfg.nice === false) {
      // Exact/zoomed bounds must not render generated ticks outside the plot.
      this.tickValues = this.tickValues.filter((v) => v >= this.d0 && v <= this.d1);
      if (!this.tickValues.includes(this.d0)) this.tickValues.unshift(this.d0);
      if (!this.tickValues.includes(this.d1)) this.tickValues.push(this.d1);
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
}

export class LogScale implements Scale {
  private l0: number;
  private l1: number;
  private r0: number;
  private r1: number;
  private format?: (v: number) => string;

  constructor(cfg: LogScaleConfig) {
    const lo = Math.max(cfg.domain[0], 1e-9);
    const hi = Math.max(cfg.domain[1], lo * 10);
    this.l0 = Math.log10(lo);
    this.l1 = Math.log10(hi);
    [this.r0, this.r1] = cfg.reversed ? [cfg.range[1], cfg.range[0]] : cfg.range;
    this.format = cfg.format;
  }

  scale(value: number | string): number {
    const v = Math.max(typeof value === 'number' ? value : parseFloat(value), 1e-9);
    const t = (Math.log10(v) - this.l0) / (this.l1 - this.l0);
    return this.r0 + t * (this.r1 - this.r0);
  }

  invert(pixel: number): number {
    const t = this.r1 === this.r0 ? 0 : (pixel - this.r0) / (this.r1 - this.r0);
    return Math.pow(10, this.l0 + t * (this.l1 - this.l0));
  }

  ticks(): number[] {
    const ticks: number[] = [];
    for (let e = Math.ceil(this.l0); e <= Math.floor(this.l1); e++) {
      ticks.push(Math.pow(10, e));
    }
    return ticks.length ? ticks : [Math.pow(10, this.l0), Math.pow(10, this.l1)];
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
