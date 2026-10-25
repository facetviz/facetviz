import { beforeEach, describe, expect, it } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function render(options: Partial<ChartOptions>): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 700, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 460, configurable: true });
  document.body.appendChild(el);
  new FacetViz(el, {
    xAxis: { categories: ['Jan', 'Feb'] },
    series: [{ type: 'column', name: 'Sales', data }],
    trellis: { columns: 'cat', rows: 'region' },
    ...options,
    chart: { animation: false, responsive: false, ...options.chart },
  } as ChartOptions);
  return el;
}

const data = [
  { x: 'Jan', y: 3, cat: 'Tech', region: 'East' }, { x: 'Feb', y: 5, cat: 'Tech', region: 'East' },
  { x: 'Jan', y: 4, cat: 'Office', region: 'East' }, { x: 'Feb', y: 2, cat: 'Office', region: 'East' },
  { x: 'Jan', y: 6, cat: 'Tech', region: 'West' }, { x: 'Feb', y: 1, cat: 'Tech', region: 'West' },
];

const num = (el: Element, a: string) => Number(el.getAttribute(a));
const labelled = (el: Element, id: string) =>
  [...el.querySelectorAll(`[data-fv-kind="axis"][data-fv-id="${id}"]`)].filter((g) => g.querySelector(':scope > text'));

describe('small multiples on the canvas', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('makes a pane for every row × column value, even one with no data', () => {
    const el = render({});
    const keys = [...el.querySelectorAll('[data-fv-kind="plotArea"]')].map((a) => a.getAttribute('data-fv-instance'));
    expect(keys).toEqual([
      'region=East#cat=Tech', 'region=East#cat=Office', 'region=West#cat=Tech', 'region=West#cat=Office',
    ]);
    // West has no Office: its pane is there, with no marks.
    expect(el.querySelectorAll('.facet-point')).toHaveLength(6);
  });

  it('draws each split field as a header level, one object per value, with its name above', () => {
    const el = render({});
    const headers = (f: string) => [...el.querySelectorAll(`text[data-fv-kind="header"][data-fv-id="${f}"]`)];
    expect(headers('cat').map((t) => t.textContent)).toEqual(['Tech', 'Office']);
    expect(headers('region').map((t) => t.textContent)).toEqual(['East', 'West']);
    expect(headers('region')[1].getAttribute('data-fv-path')).toBe('West');
    expect([...el.querySelectorAll('[data-fv-kind="fieldLabel"]')].map((t) => t.textContent).sort()).toEqual(['cat', 'region']);
    const off = render({ canvas: { fieldLabels: { columns: { visible: false }, rows: { visible: false } } } });
    expect(off.querySelectorAll('[data-fv-kind="fieldLabel"]')).toHaveLength(0);
  });

  it('labels value axes down the left column and category axes along the bottom row', () => {
    const el = render({});
    // One labelled value axis per pane row, one labelled category axis per pane column.
    expect(labelled(el, 'yAxis[0]').map((g) => g.getAttribute('data-fv-instance'))).toEqual(['region=East#cat=Tech', 'region=West#cat=Tech']);
    expect(labelled(el, 'xAxis[0]').map((g) => g.getAttribute('data-fv-instance'))).toEqual(['region=West#cat=Tech', 'region=West#cat=Office']);
  });

  it('repeats both axes in every pane with table: false', () => {
    const el = render({ trellis: { columns: 'cat', rows: 'region', table: false } });
    expect(labelled(el, 'yAxis[0]')).toHaveLength(4);
    expect(labelled(el, 'xAxis[0]')).toHaveLength(4);
    // The panes leave room between them for the repeated axes.
    const [a, b] = [...el.querySelectorAll('[data-fv-kind="plotArea"]')];
    expect(num(b, 'x') - (num(a, 'x') + num(a, 'width'))).toBeGreaterThan(30);
  });

  it('shares one value range, or gives each pane row its own', () => {
    const tops = (o: Partial<ChartOptions>) =>
      labelled(render({ ...o, series: [{ type: 'column', name: 'S', data: data.map((d) => ({ ...d, y: d.region === 'West' ? d.y * 100 : d.y })) }] }), 'yAxis[0]')
        .map((g) => Math.max(...[...g.querySelectorAll(':scope > text')].map((t) => Number(t.textContent))));
    const shared = tops({});
    expect(shared[0]).toBe(shared[1]);
    const own = tops({ yAxis: { range: { mode: 'independent' } } });
    expect(own[0]).toBeLessThan(own[1] / 10);
    expect(tops({ trellis: { columns: 'cat', rows: 'region', sharedY: false } })).toEqual(own);
  });

  it('runs a second value axis down the right column', () => {
    const el = render({
      yAxis: [{}, { title: { text: 'Margin' } }],
      series: [
        { type: 'column', name: 'Sales', data },
        { type: 'line', name: 'Margin', yAxis: 1, data: data.map((d) => ({ ...d, y: d.y / 10 })) },
      ],
    });
    expect(labelled(el, 'yAxis[1]').map((g) => g.getAttribute('data-fv-instance'))).toEqual(['region=East#cat=Office', 'region=West#cat=Office']);
  });

  it('turns for horizontal bars: categories down the left, values along the bottom', () => {
    const el = render({ chart: { type: 'bar' }, series: [{ name: 'Sales', data }], xAxis: { categories: ['Jan', 'Feb'], title: { text: 'Month' } }, yAxis: { title: { text: 'Sales' } } });
    expect(el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="xAxis[0]"].facet-axis-left')).toHaveLength(4);
    expect(labelled(el, 'xAxis[0]')).toHaveLength(2); // left column
    expect(labelled(el, 'yAxis[0]')).toHaveLength(2); // bottom row
    // The bottom axis's title once, under the panes.
    expect([...el.querySelectorAll('[data-fv-kind="axisTitle"]')].filter((t) => t.textContent === 'Sales')).toHaveLength(1);
  });

  it('draws the category axis title once below the panes', () => {
    const el = render({ xAxis: { categories: ['Jan', 'Feb'], title: { text: 'Month' } } });
    const titles = [...el.querySelectorAll('[data-fv-kind="axisTitle"][data-fv-id="xAxis[0]"]')];
    expect(titles.map((t) => t.textContent)).toEqual(['Month']);
    const area = [...el.querySelectorAll('[data-fv-kind="plotArea"]')].pop()!;
    expect(num(titles[0], 'y')).toBeGreaterThan(num(area, 'y') + num(area, 'height'));
  });

  it('hides, sizes and styles a header level, bands rows, and sets or hides dividers', () => {
    const plotY = (o: Partial<ChartOptions>) => num(render(o).querySelector('[data-fv-kind="plotArea"]')!, 'y');
    expect(plotY({ canvas: { headers: { cat: { size: 50 } } } }) - plotY({})).toBeCloseTo(30, 6);
    const hidden = render({ canvas: { headers: { cat: { visible: false } } } });
    expect(hidden.querySelectorAll('text[data-fv-kind="header"][data-fv-id="cat"]')).toHaveLength(0);
    const styled = render({ canvas: { headers: { region: { label: { style: { color: '#c00' }, format: 'R {value}' } } } } });
    const east = styled.querySelector('text[data-fv-kind="header"][data-fv-id="region"]')!;
    expect(east.textContent).toBe('R East');
    expect(east.getAttribute('fill')).toBe('#c00');
    const banded = render({ canvas: { banding: { rows: { color: '#eee', headerColor: '#ddd' } } } });
    expect(banded.querySelectorAll('.facet-canvas-band')).toHaveLength(2); // West's pane row and header
    expect(render({}).querySelectorAll('.facet-trellis-divider').length).toBeGreaterThan(0);
    expect(render({ canvas: { dividers: { columns: { level: 'none' }, rows: { level: 'none' } } } }).querySelectorAll('.facet-trellis-divider')).toHaveLength(0);
    const red = render({ canvas: { dividers: { rows: { color: '#f00', width: 2 } } } });
    expect([...red.querySelectorAll('.facet-trellis-divider')].some((l) => l.getAttribute('stroke') === '#f00' && l.getAttribute('stroke-width') === '2')).toBe(true);
  });

  it('splits by rows only or columns only', () => {
    expect(render({ trellis: { rows: 'region' } }).querySelectorAll('[data-fv-kind="plotArea"]')).toHaveLength(2);
    expect(render({ trellis: { columns: 'cat' } }).querySelectorAll('[data-fv-kind="plotArea"]')).toHaveLength(2);
  });
});
