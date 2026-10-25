import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';
import { LogScale, SymLogScale, intervalTicks } from '../src/core/scale.js';

function render(options: ChartOptions): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { ...options, chart: { animation: false, responsive: false, ...options.chart } });
  return el;
}

const categories = ['A', 'B', 'C', 'D'];
const column = (data: number[], extra: Partial<ChartOptions> = {}) =>
  render({ chart: { type: 'column' }, xAxis: { categories }, series: [{ name: 'S', data }], ...extra });
/** Tick label texts of the axis with this canvas id. */
const labels = (el: Element, id: string) =>
  [...el.querySelectorAll(`[data-fv-kind="axis"][data-fv-id="${id}"] > text`)].map((t) => t.textContent);
const num = (el: Element, a: string) => Number(el.getAttribute(a));

describe('axis objects', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('takes settings by canvas address, over the axis options', () => {
    const el = column([1, 2, 3, 4], {
      yAxis: { title: { text: 'Old' } },
      canvas: { axes: { 'yAxis[0]': { title: { text: 'Sales' } }, 'xAxis[0]': { title: { text: 'Month' } } } },
    });
    expect(el.querySelector('[data-fv-kind="axisTitle"][data-fv-id="yAxis[0]"]')!.textContent).toBe('Sales');
    expect(el.querySelector('[data-fv-kind="axisTitle"][data-fv-id="xAxis[0]"]')!.textContent).toBe('Month');
    // An axis's own id is its address too.
    const own = column([1, 2, 3, 4], { yAxis: { id: 'sales@rows' }, canvas: { axes: { 'sales@rows': { title: { text: 'By id' } } } } });
    expect(own.querySelector('[data-fv-kind="axisTitle"][data-fv-id="sales@rows"]')!.textContent).toBe('By id');
  });

  it('fixes either end of the range, leaving the other automatic', () => {
    const both = labels(column([1, 2, 3, 4], { yAxis: { range: { mode: 'fixed', start: 0, end: 10 } } }), 'yAxis[0]');
    expect(both[0]).toBe('0');
    expect(both[both.length - 1]).toBe('10');
    const endOnly = labels(column([1, 2, 3, 4], { yAxis: { range: { mode: 'fixed', start: 'auto', end: 20 } } }), 'yAxis[0]');
    expect(endOnly[endOnly.length - 1]).toBe('20');
  });

  it('lets columns start above zero when zero is not included', () => {
    expect(labels(column([100, 104, 108, 110]), 'yAxis[0]')[0]).toBe('0');
    const lifted = labels(column([100, 104, 108, 110], { yAxis: { range: { includeZero: false } } }), 'yAxis[0]');
    expect(Number(lifted[0])).toBeGreaterThan(90);
  });

  it('places major ticks at a fixed interval from an origin, or none', () => {
    const every = labels(column([1, 4, 7, 9], { yAxis: { tickInterval: 2.5 } }), 'yAxis[0]').map(Number);
    expect(every.every((v) => Math.abs(v / 2.5 - Math.round(v / 2.5)) < 1e-9)).toBe(true);
    const shifted = labels(column([1, 4, 7, 9], { yAxis: { tickInterval: 3, tickOrigin: 1 } }), 'yAxis[0]').map(Number);
    expect(shifted.every((v) => (v - 1) % 3 === 0)).toBe(true);
    const none = column([1, 4, 7, 9], { yAxis: { tickInterval: 'none' } });
    expect(labels(none, 'yAxis[0]')).toEqual([]);
    expect(none.querySelectorAll('[data-fv-kind="grid"][data-fv-id="yAxis[0]"]')).toHaveLength(0);
  });

  it('runs a symmetric log axis through zero', () => {
    const el = render({
      chart: { type: 'line' }, xAxis: { categories },
      yAxis: { type: 'log', log: { mode: 'symmetric' } },
      series: [{ name: 'P', data: [-500, -5, 20, 3000] }],
    });
    const ticks = labels(el, 'yAxis[0]').map(Number);
    expect(ticks).toContain(0);
    expect(ticks.some((v) => v < 0)).toBe(true);
    expect(ticks.some((v) => v >= 1000)).toBe(true);
    // Every point is on the plot (no NaN positions).
    const ys = [...el.querySelectorAll('.facet-point')].map((p) => num(p, 'cy'));
    expect(ys.every(Number.isFinite)).toBe(true);
  });

  it('ticks a log axis on powers of its base', () => {
    const el = render({ chart: { type: 'line' }, xAxis: { categories }, yAxis: { type: 'log', log: { base: 2 } }, series: [{ name: 'P', data: [1, 4, 30, 200] }] });
    const ticks = labels(el, 'yAxis[0]').map(Number);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.every((v) => Number.isInteger(Math.log2(v)))).toBe(true);
  });

  it('draws a subtitle beyond the title, marked with the title', () => {
    const el = column([1, 2, 3, 4], { yAxis: { title: { text: 'Sales', subtitle: 'in $K' } } });
    const [title, sub] = [...el.querySelectorAll('[data-fv-kind="axisTitle"][data-fv-id="yAxis[0]"]')];
    expect(sub.textContent).toBe('in $K');
    // Left axis: the subtitle is farther from the plot.
    expect(num(sub, 'x')).toBeLessThan(num(title, 'x'));
  });

  it('sizes an axis band', () => {
    const plotX = (o: Partial<ChartOptions>) => num(column([1, 2, 3, 4], o).querySelector('[data-fv-kind="plotArea"]')!, 'x');
    expect(plotX({ yAxis: { size: 140 } }) - plotX({ yAxis: { size: 40 } })).toBeCloseTo(100, 6);
  });

  it('synchronises a dual axis with the first: one range, same ticks, both series on it', () => {
    const el = render({
      xAxis: { categories },
      yAxis: [{}, { sync: true }],
      series: [
        { type: 'column', name: 'Sales', data: [10, 20, 30, 40] },
        { type: 'line', name: 'Target', data: [15, 25, 35, 60], yAxis: 1, marker: { enabled: true } },
      ],
    });
    const left = labels(el, 'yAxis[0]');
    expect(labels(el, 'yAxis[1]')).toEqual(left);
    // The first axis grew to hold the second's 60.
    expect(Number(left[left.length - 1])).toBeGreaterThanOrEqual(60);
    // A target of 40 would sit level with the 40 column's top.
    const unsynced = render({
      xAxis: { categories },
      yAxis: [{}, {}],
      series: [
        { type: 'column', name: 'Sales', data: [10, 20, 30, 40] },
        { type: 'line', name: 'Target', data: [15, 25, 35, 60], yAxis: 1 },
      ],
    });
    expect(labels(unsynced, 'yAxis[1]')).not.toEqual(labels(unsynced, 'yAxis[0]'));
  });

  it('gives each small-multiples row its own range when independent', () => {
    const data = [
      { name: 'A', y: 2, r: 'E', s: 'small' }, { name: 'B', y: 3, r: 'W', s: 'small' },
      { name: 'A', y: 900, r: 'E', s: 'big' }, { name: 'B', y: 700, r: 'W', s: 'big' },
    ];
    const rowsTop = (mode?: 'independent') => {
      const el = render({
        chart: { type: 'column' }, xAxis: { categories: ['A', 'B'] },
        yAxis: mode ? { range: { mode } } : {},
        trellis: { columns: 'r', rows: 's' },
        series: [{ name: 'S', data }],
      });
      // Labelled value axes: the left column, one per row.
      return [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="yAxis[0]"]')]
        .map((g) => [...g.querySelectorAll(':scope > text')].map((t) => Number(t.textContent)))
        .filter((t) => t.length)
        .map((t) => Math.max(...t));
    };
    const shared = rowsTop();
    expect(new Set(shared).size).toBe(1);
    const own = rowsTop('independent');
    expect(own).toHaveLength(2);
    // (The table drops each cell's top tick, so the big row shows up to 500 of 1000.)
    expect(Math.min(...own)).toBeLessThan(50);
    expect(Math.max(...own)).toBeGreaterThanOrEqual(500);
  });
});

describe('scales', () => {
  it('counts interval ticks from an origin, one past each end', () => {
    expect(intervalTicks(1, 9, 2.5)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(intervalTicks(2, 8, 3, 1)).toEqual([1, 4, 7, 10]);
    expect(intervalTicks(0, 10, 0)).toEqual([]);
  });

  it('maps symmetric log values monotonically through zero', () => {
    const s = new SymLogScale({ domain: [-1000, 1000], range: [0, 100] });
    expect(s.scale(0)).toBeCloseTo(50, 6);
    expect(s.scale(-1000)).toBeCloseTo(0, 6);
    expect(s.scale(10)).toBeLessThan(s.scale(100));
    expect(s.invert(s.scale(250))).toBeCloseTo(250, 6);
  });

  it('ticks a log scale on another base, or takes given ticks', () => {
    expect(new LogScale({ domain: [1, 64], range: [0, 100], base: 2, niceMin: true, niceMax: true }).ticks().every((v) => Number.isInteger(Math.log2(v)))).toBe(true);
    expect(new LogScale({ domain: [1, 100], range: [0, 100], ticks: [] }).ticks()).toEqual([]);
  });
});

describe('value padding', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('never takes positive values below zero (or negative ones above it)', () => {
    const lowest = (o: ChartOptions) => Math.min(...labels(render(o), 'yAxis[0]').map(Number));
    const highest = (o: ChartOptions) => Math.max(...labels(render(o), 'yAxis[0]').map(Number));
    // A scatter whose lowest point is near zero: padding stops at zero.
    expect(lowest({ chart: { type: 'scatter' }, series: [{ name: 'S', data: [[1, 1], [2, 30], [3, 15]] }] })).toBe(0);
    // Columns told not to reach zero, with values near it.
    expect(lowest({ chart: { type: 'column' }, xAxis: { categories }, yAxis: { startOnZero: false }, series: [{ name: 'S', data: [1, 20, 30, 40] }] })).toBe(0);
    // All negative: the top stops at zero.
    expect(highest({ chart: { type: 'line' }, xAxis: { categories }, series: [{ name: 'S', data: [-1, -20, -30, -40] }] })).toBe(0);
    // Values across zero are padded as before.
    expect(lowest({ chart: { type: 'line' }, xAxis: { categories }, series: [{ name: 'S', data: [-10, 20, 30, 40] }] })).toBeLessThan(-10);
  });
});
