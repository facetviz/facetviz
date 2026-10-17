import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const num = (e: Element, a: string) => Number(e.getAttribute(a));

describe('plot lines and bands across a group of categories', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('spans one category on a plain axis, and draws nothing for no match', () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      xAxis: { categories: ['A', 'B', 'C', 'D'] },
      yAxis: {
        plotLines: [
          { value: 5, group: ['B'] },
          { value: 6, group: ['Z'] },
          { value: 7 },
        ],
      },
      series: [{ type: 'column', name: 'S', data: [1, 2, 3, 4] }],
    });
    const lines = [...el.querySelectorAll('.facet-plotline')];
    expect(lines).toHaveLength(2);
    const [one, all] = lines;
    const w = num(all, 'x2') - num(all, 'x1');
    expect(num(one, 'x2') - num(one, 'x1')).toBeCloseTo(w / 4, 1);
    expect(num(one, 'x1')).toBeCloseTo(num(all, 'x1') + w / 4, 1);
  });

  it('spans every leaf under an outer value on a nested axis', () => {
    const el = container(600, 400);
    const pt = (r: string, c: string, y: number) => ({ y, r, c });
    new FacetViz(el, {
      chart: { animation: false },
      xAxis: { dimensions: ['r', 'c'] },
      yAxis: { plotLines: [{ value: 2, group: ['East'] }, { value: 3 }] },
      series: [{ type: 'column', name: 'S', data: [pt('East', 'a', 1), pt('East', 'b', 2), pt('East', 'c', 3), pt('West', 'a', 4)] }],
    });
    const [east, all] = [...el.querySelectorAll('.facet-plotline')];
    const w = num(all, 'x2') - num(all, 'x1');
    expect(num(east, 'x1')).toBeCloseTo(num(all, 'x1'), 1);
    expect(num(east, 'x2') - num(east, 'x1')).toBeCloseTo((w * 3) / 4, 1);
  });

  it('draws a band with an outline and whiskers, above the series when asked', () => {
    const el = container(600, 400);
    new FacetViz(el, {
      chart: { animation: false },
      xAxis: { categories: ['A', 'B'] },
      yAxis: { min: 0, max: 10, plotBands: [{ from: 4, to: 6, group: ['A'], groupPadding: 0.1, borderColor: '#333', whiskers: [1, 9], zIndex: 'above' }] },
      series: [{ type: 'column', name: 'S', data: [5, 5] }],
    });
    const band = el.querySelector('.facet-axes-above .facet-plotband')!;
    expect(band.getAttribute('stroke')).toBe('#333');
    const whiskers = el.querySelectorAll('.facet-plotband-whisker');
    // A stem and a cap at each end.
    expect(whiskers).toHaveLength(4);
    const mid = num(band, 'x') + num(band, 'width') / 2;
    expect(num(whiskers[0], 'x1')).toBeCloseTo(mid, 1);
  });
});
