import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, {
    xAxis: { categories: ['Jan', 'Feb', 'Mar'] },
    series: [
      { type: 'column', name: 'Sales', data: [10, 20, 30] },
      { type: 'line', name: 'Margin', data: [0.1, 0.3, 0.2], pane: 1 },
    ],
    ...options,
    chart: { animation: false, responsive: false, ...options.chart },
  } as ChartOptions);
  return el;
}

const num = (el: Element, a: string) => Number(el.getAttribute(a));
const areas = (el: Element) => [...el.querySelectorAll('[data-fv-kind="plotArea"]')];
/** Each pane's value axis labels, by pane. */
const valueLabels = (el: Element) =>
  [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="yAxis[0]"]')].map((g) =>
    [...g.querySelectorAll(':scope > text')].map((t) => t.textContent).filter((t) => /^-?\d/.test(t ?? '')),
  );

describe('series in panes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('stacks the panes down, sharing the width', () => {
    const el = render({});
    const [a, b] = areas(el);
    expect(areas(el).map((x) => x.getAttribute('data-fv-instance'))).toEqual(['pane:0', 'pane:1']);
    expect(num(a, 'x')).toBeCloseTo(num(b, 'x'), 6);
    expect(num(a, 'width')).toBeCloseTo(num(b, 'width'), 6);
    expect(num(b, 'y')).toBeGreaterThan(num(a, 'y') + num(a, 'height'));
  });

  it('gives each pane its own value axis and scale', () => {
    const [sales, margin] = valueLabels(render({}));
    expect(Math.max(...sales.map(Number))).toBeGreaterThanOrEqual(30);
    expect(Math.max(...margin.map(Number))).toBeLessThan(1);
  });

  it('labels the shared category axis along the bottom pane only', () => {
    const el = render({});
    const cats = [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="xAxis[0]"]')].map((g) =>
      [...g.querySelectorAll(':scope > text')].map((t) => t.textContent),
    );
    expect(cats).toEqual([[], ['Jan', 'Feb', 'Mar']]);
  });

  it('titles each pane\'s axis by its series, or as set per pane', () => {
    const titles = (el: Element) => [...el.querySelectorAll('[data-fv-kind="axisTitle"][data-fv-id="yAxis[0]"]')].map((t) => t.textContent);
    expect(titles(render({}))).toEqual(['Sales', 'Margin']);
    expect(titles(render({ panes: [{}, { yAxis: { title: { text: 'Margin %' } } }] }))).toEqual(['Sales', 'Margin %']);
  });

  it('shares the height by weight', () => {
    const [a, b] = areas(render({ panes: [{ weight: 2 }, { weight: 1 }] }));
    expect(num(a, 'height') / num(b, 'height')).toBeCloseTo(2, 6);
  });

  it('draws each pane\'s marks on its own scale, clipped to it', () => {
    const el = render({});
    const [a, b] = areas(el);
    const bars = [...el.querySelectorAll('rect.facet-point')];
    expect(bars).toHaveLength(3);
    // Columns stay in the top pane.
    expect(bars.every((r) => num(r, 'y') >= num(a, 'y') - 1 && num(r, 'y') + num(r, 'height') <= num(a, 'y') + num(a, 'height') + 1)).toBe(true);
    // The line's points stay in the bottom pane.
    const pts = [...el.querySelectorAll('.facet-line .facet-point')].map((c) => num(c, 'cy'));
    expect(pts.every((y) => y >= num(b, 'y') - 1 && y <= num(b, 'y') + num(b, 'height') + 1)).toBe(true);
  });

  it('puts the panes side by side for horizontal bars, categories down the first', () => {
    const el = render({ chart: { type: 'bar' }, series: [{ name: 'Sales', data: [10, 20, 30] }, { name: 'Units', data: [1, 2, 3], pane: 1 }] });
    const [a, b] = areas(el);
    expect(num(a, 'y')).toBeCloseTo(num(b, 'y'), 6);
    expect(num(b, 'x')).toBeGreaterThan(num(a, 'x') + num(a, 'width'));
    const cats = [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="xAxis[0]"]')].map((g) => g.querySelectorAll(':scope > text').length);
    expect(cats[0]).toBeGreaterThan(0);
    expect(cats[1]).toBe(0);
  });

  it('draws one plot as before when every series is in the same pane', () => {
    const el = render({ series: [{ type: 'column', name: 'Sales', data: [10, 20, 30] }, { type: 'line', name: 'Margin', data: [1, 3, 2], pane: 0 }] });
    expect(areas(el)).toHaveLength(1);
    expect(areas(el)[0].getAttribute('data-fv-instance')).toBeNull();
  });

  it('keeps grouped and stacked columns within a pane', () => {
    const el = render({
      plotOptions: { series: { stacking: 'normal' } },
      series: [
        { type: 'column', name: 'A', data: [1, 2, 3] },
        { type: 'column', name: 'B', data: [3, 2, 1] },
        { type: 'column', name: 'C', data: [100, 200, 300], pane: 1 },
      ],
    });
    // A and B stack to 4 in the top pane; C has its own scale below.
    const [top, bottom] = valueLabels(el);
    expect(Math.max(...top.map(Number))).toBeLessThan(10);
    expect(Math.max(...bottom.map(Number))).toBeGreaterThanOrEqual(300);
  });

  it('lays panes side by side with paneLayout columns, each with its own value axis and categories', () => {
    const el = render({ canvas: { paneLayout: 'columns' } });
    const [a, b] = areas(el);
    expect(num(a, 'y')).toBeCloseTo(num(b, 'y'), 6);
    expect(num(b, 'x')).toBeGreaterThan(num(a, 'x') + num(a, 'width') + 20);
    const cats = [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="xAxis[0]"]')].map((g) => g.querySelectorAll(':scope > text').length);
    expect(cats.every((n) => n > 0)).toBe(true);
    const [sales, margin] = valueLabels(el);
    expect(Math.max(...sales.map(Number))).toBeGreaterThanOrEqual(30);
    expect(Math.max(...margin.map(Number))).toBeLessThan(1);
  });

  it('stacks horizontal bars\' panes down with paneLayout rows', () => {
    const el = render({ chart: { type: 'bar' }, canvas: { paneLayout: 'rows' }, series: [{ name: 'Sales', data: [10, 20, 30] }, { name: 'Units', data: [1, 2, 3], pane: 1 }] });
    const [a, b] = areas(el);
    expect(num(a, 'x')).toBeCloseTo(num(b, 'x'), 6);
    expect(num(b, 'y')).toBeGreaterThan(num(a, 'y') + num(a, 'height'));
  });
});

