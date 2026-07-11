import { describe, it, expect } from 'vitest';
import { LinearScale, LogScale, CategoryScale } from '../src/core/scale.js';
import { computeBoxStats } from '../src/series/boxplot.js';

describe('LinearScale', () => {
  it('maps domain to range and back', () => {
    const s = new LinearScale({ domain: [0, 100], range: [0, 200], ticks: [0, 50, 100] });
    expect(s.scale(50)).toBe(100);
    expect(s.invert(100)).toBe(50);
  });
  it('supports a reversed range (y axis)', () => {
    const s = new LinearScale({ domain: [0, 10], range: [100, 0], ticks: [0, 5, 10] });
    expect(s.scale(0)).toBe(100);
    expect(s.scale(10)).toBe(0);
  });
});

describe('CategoryScale', () => {
  it('centres bands (with padding) and reports bandwidth', () => {
    const s = new CategoryScale({ categories: ['A', 'B', 'C', 'D'], range: [0, 400] });
    expect(s.scale('A')).toBe(50);   // first band centre
    expect(s.scale('D')).toBe(350);  // last band centre
    expect(s.bandwidth()).toBeGreaterThan(0);
    expect(s.bandwidth()).toBeLessThanOrEqual(100); // ≤ step (has inter-band padding)
  });
});

describe('LogScale', () => {
  it('is monotonic', () => {
    const s = new LogScale({ domain: [1, 1000], range: [0, 300] });
    expect(s.scale(1)).toBeLessThan(s.scale(10));
    expect(s.scale(10)).toBeLessThan(s.scale(1000));
  });
});

describe('computeBoxStats', () => {
  it('computes a five-number summary', () => {
    const b = computeBoxStats([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(b.min).toBe(1);
    expect(b.max).toBe(9);
    expect(b.median).toBe(5);
    expect(b.q1).toBe(3);
    expect(b.q3).toBe(7);
  });
});
