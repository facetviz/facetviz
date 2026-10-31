import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>, width = 260): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, {
    xAxis: { categories: ['Home Office', 'Consumer', 'Corporate'] },
    series: [{ type: 'column', name: 'Sales', data: [1, 2, 3] }],
    ...options,
    chart: { animation: false, responsive: false, ...options.chart },
  } as ChartOptions);
  return el;
}

const labels = (el: Element) => [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="xAxis[0]"] > text')];

describe('wrapped axis labels', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('breaks a label too wide for its slot onto two lines with labels.wrap', () => {
    const el = render({ xAxis: { categories: ['Home Office', 'Consumer', 'Corporate'], labels: { wrap: true } } }, 260);
    // Each line its own text, hanging from its top (WebKit drops the
    // baseline in tspans, lifting the first line over the axis).
    const home = labels(el).filter((t) => t.getAttribute('data-fv-path') === 'Home Office');
    expect(home.map((t) => t.textContent)).toEqual(['Home', 'Office']);
    expect(home.every((t) => t.getAttribute('dominant-baseline') === 'hanging' && !t.querySelector('tspan'))).toBe(true);
    expect(Number(home[1].getAttribute('y'))).toBeGreaterThan(Number(home[0].getAttribute('y')));
  });

  it('cuts labels short as before without it', () => {
    const el = render({}, 150);
    expect(new Set(labels(el).map((t) => t.getAttribute('data-fv-path'))).size).toBe(labels(el).length);
  });
});
