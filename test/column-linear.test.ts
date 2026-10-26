import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 700, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, { ...options, chart: { animation: false, responsive: false, ...options.chart } } as ChartOptions);
  return el;
}

const rects = (el: Element) => [...el.querySelectorAll('rect.facet-point')];
const num = (el: Element, a: string) => Number(el.getAttribute(a));

describe('columns on a continuous x axis', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('places each column at its number, a few pixels wide rather than a hairline', () => {
    const el = render({ xAxis: { type: 'linear', min: 0, max: 100 }, series: [{ type: 'column', name: 'Sales', data: [[20, 5], [80, 3]] }] });
    const [a, b] = rects(el);
    expect(num(a, 'width')).toBeGreaterThanOrEqual(4);
    expect(num(a, 'width')).toBeLessThanOrEqual(24);
    expect(num(b, 'x')).toBeGreaterThan(num(a, 'x'));
  });

  it('draws a column per panel at its own number in small multiples', () => {
    const el = render({
      xAxis: { type: 'linear', min: 0 },
      series: [{ type: 'column', name: 'Sales', data: [{ x: 4, y: 38, seg: 'Consumer' }, { x: 3, y: 23, seg: 'Corporate' }, { x: 2, y: 14, seg: 'Home' }] }],
      trellis: { columns: 'seg' },
    });
    const bars = rects(el);
    expect(bars).toHaveLength(3);
    for (const r of bars) expect(num(r, 'width')).toBeGreaterThanOrEqual(4);
    // The panels share one 0–4 scale: each column sits further left in its
    // panel than the one before, as its number is smaller.
    const panels = [...el.querySelectorAll('[data-fv-kind="plotArea"]')].map((p) => p.getBoundingClientRect ? num(p.querySelector('rect') ?? p, 'x') : 0);
    const offsets = bars.map((r, i) => num(r, 'x') - panels[i]);
    expect(offsets[0]).toBeGreaterThan(offsets[1]);
    expect(offsets[1]).toBeGreaterThan(offsets[2]);
  });

  it('runs a bar chart’s numbers up its side, growing upwards, with room for their labels', () => {
    const el = render({
      chart: { type: 'bar' },
      xAxis: { type: 'linear', title: { text: 'Profit' } },
      series: [{ type: 'bar', name: 'Sales', data: [{ x: 1, y: 5, seg: 'A' }, { x: 3, y: 4, seg: 'B' }] }],
      trellis: { columns: 'seg' },
    });
    const [a, b] = rects(el);
    // The larger number sits higher.
    expect(num(b, 'y')).toBeLessThan(num(a, 'y'));
    const title = el.querySelector('text[data-fv-kind="axisTitle"][data-fv-id="xAxis[0]"]');
    expect(num(title!, 'x')).toBeGreaterThan(8);
  });
});
