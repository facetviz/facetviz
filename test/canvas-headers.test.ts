import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function container(width = 600, height = 400): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const data = [
  { y: 2, region: 'East', cat: 'Tech', q: 'Q1' },
  { y: 3, region: 'East', cat: 'Tech', q: 'Q2' },
  { y: 4, region: 'East', cat: 'Office', q: 'Q1' },
  { y: 5, region: 'West', cat: 'Tech', q: 'Q1' },
];

function chart(options: Partial<ChartOptions> = {}) {
  const el = container();
  const canvasClick = vi.fn();
  new FacetViz(el, {
    xAxis: { dimensions: ['region', 'cat', 'q'] },
    series: [{ type: 'column', name: 'S', data }],
    ...options,
    chart: { animation: false, responsive: false, events: { canvasClick }, ...options.chart },
  } as ChartOptions);
  return { el, canvasClick };
}

const num = (el: Element, a: string) => Number(el.getAttribute(a));
const headers = (el: Element, field: string) =>
  [...el.querySelectorAll(`text[data-fv-kind="header"][data-fv-id="${field}"]`)];

describe('header levels on the nested axis', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('draws each header level as its own object, one text per cell, with its path', () => {
    const { el, canvasClick } = chart();
    expect(headers(el, 'region').map((t) => t.textContent)).toEqual(['East', 'West']);
    expect(headers(el, 'cat').map((t) => t.textContent)).toEqual(['Tech', 'Office', 'Tech']);
    // The categories are the axis's own labels, not a header level.
    expect(headers(el, 'q')).toHaveLength(0);
    const westTech = headers(el, 'cat')[2];
    westTech.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvasClick.mock.calls[0][0]).toMatchObject({ kind: 'header', id: 'cat', path: ['West', 'Tech'] });
  });

  it('gives every outer group its own pane, each with its own plot area', () => {
    const { el } = chart();
    const areas = [...el.querySelectorAll('[data-fv-kind="plotArea"]')];
    expect(areas.map((a) => a.getAttribute('data-fv-instance'))).toEqual([
      // Pane keys are row#column; nothing on Rows here.
      '#region=East|cat=Tech', '#region=East|cat=Office', '#region=West|cat=Tech',
    ]);
    // Panes share the width by their number of categories (2, 1, 1).
    const widths = areas.map((a) => num(a, 'width'));
    expect(widths[0]).toBeCloseTo(widths[1] * 2, 6);
    expect(widths[1]).toBeCloseTo(widths[2], 6);
  });

  it('stops a line at its pane\'s edge', () => {
    const { el } = chart({ series: [{ type: 'line', name: 'L', data }] });
    // One line per pane: East/Tech (Q1–Q2), East/Office, West/Tech.
    expect(el.querySelectorAll('g.facet-line.L')).toHaveLength(3);
  });

  it('hides one level and gives its room back to the panes', () => {
    const plotHeight = (o: Partial<ChartOptions>) => num(chart(o).el.querySelector('[data-fv-kind="plotArea"]')!, 'height');
    const { el } = chart({ canvas: { headers: { cat: { visible: false } } } });
    expect(headers(el, 'cat')).toHaveLength(0);
    expect(headers(el, 'region')).toHaveLength(2);
    expect(plotHeight({ canvas: { headers: { cat: { visible: false } } } }) - plotHeight({})).toBeCloseTo(18, 6);
  });

  it('sizes, styles, formats and fills one level', () => {
    const { el } = chart({
      canvas: { headers: { region: { size: 40, label: { style: { color: '#c00' }, format: 'R:{value}' }, background: '#eef' } } },
    });
    const [east] = headers(el, 'region');
    expect(east.textContent).toBe('R:East');
    expect(east.getAttribute('fill')).toBe('#c00');
    const bg = el.querySelector('rect.facet-header-background[data-fv-id="region"]')!;
    expect(bg.getAttribute('fill')).toBe('#eef');
    expect(num(bg, 'height')).toBe(40);
    // The other level keeps the axis's look.
    expect(headers(el, 'cat')[0].getAttribute('fill')).not.toBe('#c00');
  });

  it('draws dividers down to a chosen level, in their own colour and width', () => {
    const lines = (o: Partial<ChartOptions>) =>
      [...chart(o).el.querySelectorAll('.facet-nested-group-separator')];
    expect(lines({})).toHaveLength(2); // East | West and Tech | Office
    expect(lines({ canvas: { dividers: { columns: { level: 0 } } } })).toHaveLength(1); // East | West only
    expect(lines({ canvas: { dividers: { columns: { level: 'all' } } } })).toHaveLength(3);
    expect(lines({ canvas: { dividers: { columns: { level: 'none' } } } })).toHaveLength(0);
    const [styled] = lines({ canvas: { dividers: { columns: { color: '#0a0', width: 2, dashStyle: '4 2' } } } });
    expect(styled.getAttribute('stroke')).toBe('#0a0');
    expect(styled.getAttribute('stroke-width')).toBe('2');
    expect(styled.getAttribute('stroke-dasharray')).toBe('4 2');
    // The old groupLines option still works.
    expect(lines({ xAxis: { dimensions: ['region', 'cat', 'q'], groupLines: 'all' } })).toHaveLength(3);
  });

  it('bands every other group of a level across the panes and its header cells', () => {
    const { el } = chart({ canvas: { banding: { columns: { color: '#f3f3f3', headerColor: '#ddd', level: 1 } } } });
    const bands = [...el.querySelectorAll('.facet-canvas-band')];
    // cat groups: East/Tech, East/Office, West/Tech -> the second is shaded.
    const plotBands = bands.filter((b) => !b.classList.contains('facet-canvas-header-band'));
    expect(plotBands).toHaveLength(1);
    expect(plotBands[0].getAttribute('fill')).toBe('#f3f3f3');
    expect(bands.filter((b) => b.classList.contains('facet-canvas-header-band'))).toHaveLength(1);
    const region = chart({ canvas: { banding: { columns: { color: '#eee', level: 0 } } } }).el;
    expect(region.querySelectorAll('.facet-canvas-band')).toHaveLength(1); // West
  });

  it('shows field labels beside their levels when asked', () => {
    const { el, canvasClick } = chart({ canvas: { fieldLabels: { columns: { visible: true } } } });
    const labels = [...el.querySelectorAll('text[data-fv-kind="fieldLabel"]')];
    expect(labels.map((l) => l.textContent)).toEqual(['region', 'cat', 'q']);
    labels[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvasClick.mock.calls[0][0]).toMatchObject({ kind: 'fieldLabel', id: 'region' });
    expect(chart().el.querySelectorAll('[data-fv-kind="fieldLabel"]')).toHaveLength(0);
  });

  it('runs header levels down the left for horizontal bars, outer level farthest out', () => {
    const { el } = chart({ chart: { type: 'bar' }, series: [{ name: 'S', data }] });
    const region = headers(el, 'region')[0];
    const cat = headers(el, 'cat')[0];
    const area = el.querySelector('[data-fv-kind="plotArea"]')!;
    expect(num(region, 'x')).toBeLessThan(num(cat, 'x'));
    expect(num(cat, 'x')).toBeLessThan(num(area, 'x'));
    // Each pane is a band of rows.
    expect(el.querySelectorAll('[data-fv-kind="plotArea"]')).toHaveLength(3);
  });

  it('puts header levels on top with opposite (split), categories staying below', () => {
    const { el } = chart({ xAxis: { dimensions: ['region', 'cat', 'q'], opposite: true } });
    const area = el.querySelector('[data-fv-kind="plotArea"]')!;
    expect(num(headers(el, 'region')[0], 'y')).toBeLessThan(num(area, 'y'));
    expect(num(headers(el, 'region')[0], 'y')).toBeLessThan(num(headers(el, 'cat')[0], 'y'));
  });
});
