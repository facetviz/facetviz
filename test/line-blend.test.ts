import { describe, it, expect, beforeEach } from 'vitest';
import { FacetViz } from '../src/index.js';

function render(series: unknown[]): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, {
    chart: { type: 'line', animation: false },
    xAxis: { categories: ['A', 'B', 'C'] },
    legend: { enabled: true },
    series,
  } as never);
  return el;
}

describe('line blendPointColors', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('draws a segment per pair, shading between differing point colors', () => {
    const el = render([
      {
        name: 'S',
        color: '#000000',
        blendPointColors: true,
        data: [
          { x: 1, y: 1, color: '#ff0000' },
          { x: 1, y: 3, color: '#0000ff' },
          { x: 1, y: 5, color: '#0000ff' },
        ],
      },
    ]);
    const paths = [...el.querySelectorAll('.facet-line path')];
    expect(paths.length).toBe(2);
    expect(paths[0].getAttribute('stroke')).toMatch(/^url\(#facet-line-blend-\d+\)$/);
    expect(paths[1].getAttribute('stroke')).toBe('#0000ff');
    const stops = [...el.querySelectorAll('.facet-line linearGradient stop')].map((s) => s.getAttribute('stop-color'));
    expect(stops).toEqual(['#ff0000', '#0000ff']);
  });

  it('fills a marker with its point color', () => {
    const el = render([
      { name: 'S', color: '#000000', marker: { enabled: true }, data: [{ x: 0, y: 1, color: '#ff0000' }, { x: 1, y: 2 }] },
    ]);
    const fills = [...el.querySelectorAll('.facet-line circle, .facet-line path.facet-marker')].map((m) => m.getAttribute('fill'));
    expect(fills.slice(0, 2)).toEqual(['#ff0000', '#000000']);
  });

  it('keeps one path per segment without the option', () => {
    const el = render([{ name: 'S', data: [{ x: 0, y: 1, color: '#ff0000' }, { x: 1, y: 2 }, { x: 2, y: 3 }] }]);
    expect(el.querySelectorAll('.facet-line path').length).toBe(1);
  });
});
