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

  describe('with series in panes', () => {
    const profit = data.map((d) => ({ ...d, y: d.y * 100 }));
    const two = (canvas: ChartOptions['canvas'] = {}) =>
      render({
        trellis: { columns: 'cat' },
        canvas,
        series: [
          { type: 'column', name: 'Sales', data },
          { type: 'column', name: 'Profit', data: profit, pane: 1 },
        ],
      });
    const instances = (el: Element) => [...el.querySelectorAll('[data-fv-kind="plotArea"]')].map((a) => a.getAttribute('data-fv-instance'));
    const valueTops = (el: Element) =>
      [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="yAxis[0]"]')]
        .map((g) => [...g.querySelectorAll(':scope > text')].map((t) => Number(t.textContent)).filter((n) => !Number.isNaN(n)))
        .filter((ns) => ns.length)
        .map((ns) => Math.max(...ns));

    it('gives each measure a row of panels, on its own scale shared across them', () => {
      const el = two();
      // 2 measure rows x 2 categories.
      expect(instances(el)).toHaveLength(4);
      expect(instances(el)[0]).toContain('@measure=0');
      expect(instances(el)[2]).toContain('@measure=1');
      const tops = valueTops(el);
      expect(tops).toHaveLength(2);
      expect(tops[1]).toBeGreaterThan(tops[0] * 10);
      // Each row is named by its measure at its left, before its labels.
      const titles = [...el.querySelectorAll('[data-fv-kind="axisTitle"][data-fv-id="yAxis[0]"]')].map((t) => t.textContent);
      expect(titles).toEqual(['Sales', 'Profit']);
      const names = [...el.querySelectorAll('.facet-pane-names text')];
      const firstPane = el.querySelector('[data-fv-kind="plotArea"]')!;
      expect(names.every((t) => !t.getAttribute('transform'))).toBe(true);
      expect(Number(names[0].getAttribute('x'))).toBeLessThan(Number(firstPane.getAttribute('x')) - 20);
    });

    it('puts the measures side by side with paneLayout columns, each labelling its value axis', () => {
      const el = two({ paneLayout: 'columns' });
      const areas = [...el.querySelectorAll('[data-fv-kind="plotArea"]')];
      expect(areas).toHaveLength(4);
      expect(new Set(areas.map((a) => a.getAttribute('y'))).size).toBe(1);
      expect(valueTops(el)).toHaveLength(4);
      // Named above each measure column.
      expect([...el.querySelectorAll('.facet-pane-names text')].map((t) => t.textContent)).toEqual(['Sales', 'Profit', 'Sales', 'Profit']);
    });
  });

  it('titles the value axis in every pane row, centred on it', () => {
    const el = render({ yAxis: { title: { text: 'Revenue' } } });
    const titles = [...el.querySelectorAll('[data-fv-kind="axisTitle"][data-fv-id="yAxis[0]"]')];
    const rowAreas = [...el.querySelectorAll('[data-fv-kind="plotArea"]')].filter((a, i, all) => all.findIndex((b) => b.getAttribute('y') === a.getAttribute('y')) === i);
    expect(titles).toHaveLength(rowAreas.length);
    expect(rowAreas.length).toBeGreaterThan(1);
    titles.forEach((t, i) => {
      const y = Number(t.getAttribute('y'));
      const top = Number(rowAreas[i].getAttribute('y'));
      expect(y).toBeGreaterThan(top);
      expect(y).toBeLessThan(top + Number(rowAreas[i].getAttribute('height')));
    });
  });

  it('draws tick marks only on the labelled axes, none on the dividers inside', () => {
    const el = render({});
    const axes = [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="yAxis[0]"]')];
    const ticksOf = (g: Element) => [...g.querySelectorAll(':scope > line')].filter((l) => !(l.getAttribute('class') ?? '').includes('gridline')).length;
    const labelled = axes.filter((g) => g.querySelector(':scope > text'));
    const inner = axes.filter((g) => !g.querySelector(':scope > text'));
    expect(inner.length).toBeGreaterThan(0);
    expect(inner.every((g) => ticksOf(g) === 0)).toBe(true);
    expect(labelled.length).toBeGreaterThan(0);
  });

  it('names the column field as asked, bold, with its values in regular weight', () => {
    const el = render({ canvas: { fieldLabels: { columns: { text: 'cat / month' } } } });
    const label = [...el.querySelectorAll('[data-fv-kind="fieldLabel"]')].find((t) => t.textContent === 'cat / month');
    expect(label?.getAttribute('font-weight')).toBe('600');
    const header = el.querySelector('[data-fv-kind="header"]')!;
    expect(header.getAttribute('font-weight')).toBeNull();
  });

  it('runs the lines between columns down through the labels, and closes the right edge', () => {
    const el = render({});
    const lines = [...el.querySelectorAll('.facet-trellis-divider')];
    const plotBottom = Math.max(...[...el.querySelectorAll('[data-fv-kind="plotArea"]')].map((a) => Number(a.getAttribute('y')) + Number(a.getAttribute('height'))));
    const vertical = lines.filter((l) => l.getAttribute('x1') === l.getAttribute('x2'));
    expect(vertical.some((l) => Number(l.getAttribute('y2')) > plotBottom + 5)).toBe(true);
    const right = Math.max(...vertical.map((l) => Number(l.getAttribute('x1'))));
    const paneRight = Math.max(...[...el.querySelectorAll('[data-fv-kind="plotArea"]')].map((a) => Number(a.getAttribute('x')) + Number(a.getAttribute('width'))));
    expect(right).toBeCloseTo(paneRight, 0);
  });

  it('gives a short pane at least three value ticks', () => {
    const el = render({});
    const ticks = [...el.querySelectorAll('[data-fv-kind="axis"][data-fv-id="yAxis[0]"]')]
      .map((g) => g.querySelectorAll(':scope > text').length)
      .filter((n) => n > 0);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(3);
  });
});

