import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const data = [['A', 1200], ['B', 3400], ['C', 2100]] as [string, number][];
const title = (el: HTMLElement) => [...el.querySelectorAll('text')].find((t) => t.textContent === 'Sales')!;
const plotLeft = (el: HTMLElement) => Math.min(...[...el.querySelectorAll('.facet-gridline')].map((g) => Number(g.getAttribute('x1'))));
const yOf = (t: SVGTextElement) => {
  const m = /translate\(0, ([\d.-]+)\)/.exec(t.parentElement?.getAttribute('transform') ?? '');
  return Number(t.getAttribute('y')) + (m ? Number(m[1]) : 0);
};

describe('title alignTo and verticalAlign', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('lines up with the plot area past the axis labels', () => {
    const el = container(400, 300);
    new FacetViz(el, { chart: { type: 'column', animation: false }, title: { text: 'Sales', align: 'left' }, series: [{ type: 'column', name: 'S', data }] });
    const chart = Number(title(el).getAttribute('x'));
    const el2 = container(400, 300);
    new FacetViz(el2, { chart: { type: 'column', animation: false }, title: { text: 'Sales', align: 'left', alignTo: 'plot' }, series: [{ type: 'column', name: 'S', data }] });
    const plot = Number(title(el2).getAttribute('x'));
    expect(plot).toBeGreaterThan(chart);
    expect(plot).toBeCloseTo(plotLeft(el2), 0);
  });

  it('sits under the chart at the bottom, which then starts higher', () => {
    const el = container(400, 300);
    new FacetViz(el, { chart: { type: 'column', animation: false }, title: { text: 'Sales', verticalAlign: 'bottom' }, series: [{ type: 'column', name: 'S', data }] });
    expect(yOf(title(el))).toBeGreaterThan(270);
    expect(yOf(title(el))).toBeLessThanOrEqual(300);
    const top = Math.min(...[...el.querySelectorAll('.facet-gridline')].map((g) => Number(g.getAttribute('y1'))));
    expect(top).toBeLessThan(40);
  });
});
