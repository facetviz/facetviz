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
    const home = labels(el).find((t) => t.textContent?.replace(/\s/g, '') === 'HomeOffice');
    expect(home).toBeTruthy();
    expect([...home!.querySelectorAll('tspan')].map((s) => s.textContent)).toEqual(['Home', 'Office']);
  });

  it('cuts labels short as before without it', () => {
    const el = render({}, 150);
    expect(labels(el).some((t) => t.querySelector('tspan'))).toBe(false);
  });
});
