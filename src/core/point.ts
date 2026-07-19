/**
 * Normalises the many accepted point shapes into one internal {@link Point}.
 *
 * Authors can pass `5`, `[cat, 5]`, `[cat, low, high]`, or a full object; every
 * series consumes the same normalised structure so the rendering code stays
 * simple.
 */

import type { PointInput, PointOptions } from './options.js';

export interface Point {
  /** Category label or numeric x value. */
  x: number | string;
  /** Zero-based position along a categorical x axis. */
  index: number;
  y?: number;
  low?: number;
  high?: number;
  /** Boxplot five-number summary. */
  box?: { min: number; q1: number; median: number; q3: number; max: number; outliers?: number[] };
  name?: string;
  color?: string;
  /** Original user options, surfaced back through tooltips and events. */
  options: PointOptions;

  // --- Filled in during layout ---
  /** Stack accumulation bottom / top (value-space). */
  stackLow?: number;
  stackHigh?: number;
  /** Percentage within a percent stack. */
  percent?: number;
}

export function normalizePoints(
  data: PointInput[],
  categories?: string[],
): Point[] {
  return data.map((raw, index) => normalizePoint(raw, index, categories));
}

function normalizePoint(
  raw: PointInput,
  index: number,
  categories?: string[],
): Point {
  const catX = categories?.[index] ?? index;

  if (raw === null) {
    return { x: catX, index, options: {} };
  }

  if (typeof raw === 'number') {
    return { x: catX, index, y: raw, options: { y: raw } };
  }

  if (Array.isArray(raw)) {
    const [x, a, b] = raw;
    if (b !== undefined) {
      // [x, low, high]
      return {
        x,
        index,
        low: a,
        high: b,
        options: { x, low: a, high: b },
      };
    }
    return { x, index, y: a, options: { x, y: a } };
  }

  // PointOptions object
  const opts = raw as PointOptions;
  // A non-empty `name` acts as the x value (pie slices etc.); an empty name
  // falls back to the category / index so points don't collapse onto one x.
  const nameOrCat = opts.name !== undefined && opts.name !== '' ? opts.name : catX;
  const point: Point = {
    x: opts.x ?? nameOrCat,
    index,
    y: opts.y,
    low: opts.low,
    high: opts.high,
    name: opts.name,
    color: opts.color,
    options: opts,
  };
  if (
    opts.min !== undefined &&
    opts.q1 !== undefined &&
    opts.median !== undefined &&
    opts.q3 !== undefined &&
    opts.max !== undefined
  ) {
    point.box = {
      min: opts.min,
      q1: opts.q1,
      median: opts.median,
      q3: opts.q3,
      max: opts.max,
      outliers: opts.outliers?.length ? opts.outliers : undefined,
    };
  }
  return point;
}
