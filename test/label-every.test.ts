import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const data = Array.from({ length: 7 }, (_, i) => [`P${i}`, 100 + i] as [string, number]);

const labels = (el: HTMLElement) =>
  [...el.querySelectorAll('text')].map((t) => t.textContent ?? '').filter((t) => t.startsWith('L')).sort();

describe('data labels on every nth point', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('labels points 0, n, 2n … of each series', () => {
    for (const type of ['column', 'bar', 'line', 'area', 'scatter'] as const) {
      const el = container(600, 400);
      new FacetViz(el, {
        chart: { animation: false },
        series: [{ type, name: 'Sales', dataLabels: { enabled: true, format: 'L{y}', every: 3 }, data }],
      });
      expect(labels(el), type).toEqual(['L100', 'L103', 'L106']);
    }
  });

  it('labels every point when unset, 1 or nonsense', () => {
    for (const every of [undefined, 1, 0, -2]) {
      const el = container(600, 400);
      new FacetViz(el, {
        chart: { animation: false },
        series: [{ type: 'line', name: 'Sales', dataLabels: { enabled: true, format: 'L{y}', every }, data }],
      });
      expect(labels(el)).toHaveLength(7);
    }
  });

  it('counts each stacked series on its own', () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      plotOptions: { column: { stacking: 'normal' } },
      series: [
        { type: 'column', name: 'A', dataLabels: { enabled: true, format: 'L{y}', every: 2, position: 'outside' }, data },
        { type: 'column', name: 'B', dataLabels: { enabled: true, format: 'Lb{y}', every: 3, position: 'outside' }, data },
      ],
    });
    const all = labels(el);
    expect(all.filter((t) => !t.startsWith('Lb'))).toEqual(['L100', 'L102', 'L104', 'L106']);
    expect(all.filter((t) => t.startsWith('Lb'))).toEqual(['Lb100', 'Lb103', 'Lb106']);
  });
});
