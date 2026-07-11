import { describe, it, expect, beforeEach } from 'vitest';
import { JChart } from '../src/index.js';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('JChart rendering', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders an SVG for a column chart', () => {
    const el = container();
    new JChart(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A', 'B'] }, series: [{ name: 'S', data: [3, 5] }] });
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(el.querySelectorAll('.jchart-column .jchart-point').length).toBe(2);
  });

  it('draws one grouped bar set per series', () => {
    const el = container();
    new JChart(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A', 'B'] }, series: [{ name: 'X', data: [1, 2] }, { name: 'Y', data: [3, 4] }] });
    expect(el.querySelectorAll('.jchart-column .jchart-point').length).toBe(4);
  });

  it('inverts the axis mapping for bar charts', () => {
    const el = container();
    new JChart(el, { chart: { type: 'bar', animation: false }, xAxis: { categories: ['Jan', 'Feb'] }, yAxis: { title: { text: 'Units' } }, series: [{ name: 'S', data: [5, 3] }] });
    const left = [...el.querySelectorAll('.jchart-axis-left text')].map((t) => t.textContent);
    const bottom = [...el.querySelectorAll('.jchart-axis-bottom text')].map((t) => t.textContent);
    expect(left).toContain('Jan'); // categories on the left
    expect(bottom).toContain('Units'); // value axis + title on the bottom
  });

  it('renders each registered chart type without throwing', () => {
    const types: Array<[string, any]> = [
      ['line', [[0, 1], [1, 3]]],
      ['pie', [{ name: 'A', y: 3 }, { name: 'B', y: 5 }]],
      ['bubble', [{ x: 1, y: 2, z: 3 }, { x: 2, y: 4, z: 8 }]],
      ['scatter', [[1, 2], [3, 4]]],
      ['gauge', [{ y: 42 }]],
      ['funnel', [{ name: 'A', y: 10 }, { name: 'B', y: 6 }]],
      ['heatmap', [{ x: 'a', y: 'x', value: 1 }, { x: 'b', y: 'y', value: 2 }]],
      ['treegraph', [{ id: 'a', name: 'A' }, { id: 'b', parent: 'a', name: 'B' }]],
      ['sunburst', [{ id: 'a', name: 'A' }, { id: 'b', parent: 'a', name: 'B', value: 3 }]],
      ['sankey', [{ from: 'A', to: 'B', weight: 5 }]],
    ];
    for (const [type, data] of types) {
      const el = container();
      expect(() => new JChart(el, { chart: { type, animation: false } as any, series: [{ name: 'S', data }] })).not.toThrow();
      expect(el.querySelector('svg')).toBeTruthy();
    }
  });

  it('renders a large (boost-triggering) scatter without throwing', () => {
    const el = container();
    const data = Array.from({ length: 3000 }, (_, i) => [i, Math.sin(i / 20)]);
    expect(() => new JChart(el, { chart: { type: 'scatter', animation: false }, series: [{ name: 'S', data }] })).not.toThrow();
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('toggles series visibility and exports SVG', () => {
    const el = container();
    const chart = new JChart(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A'] }, series: [{ name: 'S', data: [3] }] });
    const svg = chart.getSVG();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns');
    chart.setData(0, [7]);
    expect(el.querySelectorAll('.jchart-column .jchart-point').length).toBe(1);
  });
});
