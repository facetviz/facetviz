/** Stack computation shared by every cartesian layout. */
import type { Point } from './point.js';
import type { BaseSeries } from '../series/base.js';

const pointKey = (p: Point): string => `${typeof p.x}:${String(p.x)}`;

/** Mutate normalized points with their stack low/high coordinates. */
export function computeStacks(visible: BaseSeries[]): void {
  for (const s of visible) {
    for (const p of s.points) {
      p.stackLow = undefined;
      p.stackHigh = undefined;
      p.stackEnd = undefined;
      p.stackStart = undefined;
    }
  }

  const groups = new Map<string, BaseSeries[]>();
  for (const s of visible) {
    if (!s.options.stacking || !s.capabilities().stackable) continue;
    const key = `${s.options.yAxis ?? 0}:${s.options.stack ?? 'default'}`;
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const mode = group[0].options.stacking;
    const keys = new Set<string>();
    const pointsBySeries = new Map<BaseSeries, Map<string, Point>>();
    for (const s of group) {
      const byKey = new Map<string, Point>();
      for (const p of s.points) {
        const key = pointKey(p);
        keys.add(key);
        byKey.set(key, p);
      }
      pointsBySeries.set(s, byKey);
    }

    // Areas whose series cross zero stack on one running (signed) base:
    // with ups and downs on bases of their own, a series' band would jump
    // between them from one x to the next and cross the others.
    const signed = group.every((s) => s.type === 'area' || s.type === 'areaspline') &&
      group.some((s) => s.points.some((p) => (p.y ?? 0) > 0) && s.points.some((p) => (p.y ?? 0) < 0));
    for (const key of keys) {
      let runningBase = 0;
      let positiveBase = 0;
      let negativeBase = 0;
      let total = 0;
      if (mode === 'percent') {
        for (const s of group)
          total += Math.abs(pointsBySeries.get(s)?.get(key)?.y ?? 0);
      }

      // The first and last segments with a value, up and down.
      const ends = { up: [] as Point[], down: [] as Point[] };
      for (const s of group) {
        const point = pointsBySeries.get(s)?.get(key);
        if (!point || point.y === undefined) continue;
        if (point.y !== 0) (point.y > 0 ? ends.up : ends.down).push(point);
        let value = point.y;
        if (mode === 'percent' && total > 0) value = (value / total) * 100;
        if (signed) {
          point.stackLow = runningBase;
          point.stackHigh = runningBase + value;
          runningBase += value;
        } else if (value >= 0) {
          point.stackLow = positiveBase;
          point.stackHigh = positiveBase + value;
          positiveBase += value;
        } else {
          point.stackHigh = negativeBase;
          point.stackLow = negativeBase + value;
          negativeBase += value;
        }
      }
      for (const run of [ends.up, ends.down]) {
        if (!run.length) continue;
        run[0].stackStart = true;
        run[run.length - 1].stackEnd = true;
      }
    }
  }
}
