import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz } from '../src/index.js';
import type { ChartOptions } from '../src/index.js';

function container(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const data: [string, number][] = [
  ['A', 3],
  ['B', 5],
];

function chart(options: Partial<ChartOptions>) {
  const el = container(600, 400);
  const canvasClick = vi.fn();
  const canvasDoubleClick = vi.fn();
  const canvasContextMenu = vi.fn();
  new FacetViz(el, {
    title: { text: 'Sales' },
    subtitle: { text: 'By month' },
    xAxis: { categories: ['A', 'B'], title: { text: 'Month' } },
    yAxis: { title: { text: 'Amount' } },
    series: [{ type: 'column', name: 'S', data }],
    ...options,
    chart: { animation: false, events: { canvasClick, canvasDoubleClick, canvasContextMenu }, ...options.chart },
  } as ChartOptions);
  return { el, canvasClick, canvasDoubleClick, canvasContextMenu };
}

const fire = (el: Element, type: string) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

describe('canvas parts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('marks axes, axis titles, grid, plot area, titles and legend with their kind and id', () => {
    const { el } = chart({
      legend: { enabled: true },
      series: [
        { type: 'column', name: 'S', data },
        { type: 'column', name: 'T', data },
      ],
    });
    const kinds = (kind: string) => [...el.querySelectorAll(`[data-fv-kind="${kind}"]`)].map((e) => e.getAttribute('data-fv-id'));
    expect(kinds('axis').sort()).toEqual(['xAxis[0]', 'yAxis[0]']);
    expect(kinds('axisTitle').sort()).toEqual(['xAxis[0]', 'yAxis[0]']);
    expect(new Set(kinds('grid'))).toEqual(new Set(['yAxis[0]']));
    expect(kinds('plotArea')).toEqual(['plotArea']);
    expect(kinds('title')).toEqual(['title']);
    expect(kinds('subtitle')).toEqual(['subtitle']);
    expect(kinds('legend')).toEqual(['legend']);
  });

  it('puts the plot area first in its layer, under grid lines and marks', () => {
    const { el } = chart({});
    const area = el.querySelector('[data-fv-kind="plotArea"]')!;
    expect(area.parentElement!.firstElementChild).toBe(area);
    expect(area.getAttribute('fill')).toBe('transparent');
  });

  it('uses an axis id the caller sets, and marks a second value axis', () => {
    const { el } = chart({
      yAxis: [{ id: 'sales@rows' }, { id: 'profit@rows:dual' }],
      series: [
        { type: 'column', name: 'S', data },
        { type: 'line', name: 'P', data, yAxis: 1 },
      ],
    });
    const ids = [...el.querySelectorAll('[data-fv-kind="axis"]')].map((e) => e.getAttribute('data-fv-id')).sort();
    expect(ids).toEqual(['profit@rows:dual', 'sales@rows', 'xAxis[0]']);
  });

  it('reports a click, double-click and right-click on a part', () => {
    const { el, canvasClick, canvasDoubleClick, canvasContextMenu } = chart({});
    const title = el.querySelector('[data-fv-kind="axisTitle"][data-fv-id="yAxis[0]"]')!;
    fire(title, 'click');
    expect(canvasClick).toHaveBeenCalledTimes(1);
    expect(canvasClick.mock.calls[0][0]).toMatchObject({ type: 'click', kind: 'axisTitle', id: 'yAxis[0]' });

    const label = el.querySelector('[data-fv-kind="axis"][data-fv-id="xAxis[0]"] text')!;
    fire(label, 'dblclick');
    expect(canvasDoubleClick.mock.calls[0][0]).toMatchObject({ type: 'dblclick', kind: 'axis', id: 'xAxis[0]' });

    const right = fire(el.querySelector('[data-fv-kind="plotArea"]')!, 'contextmenu');
    expect(right.defaultPrevented).toBe(true);
    expect(canvasContextMenu.mock.calls[0][0]).toMatchObject({ type: 'contextmenu', kind: 'plotArea', id: 'plotArea' });
  });

  it('leaves clicks on marks to point events', () => {
    const { el, canvasClick } = chart({});
    fire(el.querySelector('.facet-point')!, 'click');
    expect(canvasClick).not.toHaveBeenCalled();
  });

  it('gives each small-multiples cell its own instance', () => {
    const { el, canvasClick } = chart({
      title: undefined,
      subtitle: undefined,
      trellis: { columns: 'region' },
      series: [{ type: 'column', name: 'S', data: [
        { name: 'A', y: 3, region: 'East' },
        { name: 'B', y: 5, region: 'West' },
      ] }],
    });
    const areas = [...el.querySelectorAll('[data-fv-kind="plotArea"]')];
    expect(areas.map((a) => a.getAttribute('data-fv-instance'))).toEqual(['0:0', '0:1']);
    fire(areas[1], 'click');
    expect(canvasClick.mock.calls[0][0]).toMatchObject({ kind: 'plotArea', instance: '0:1' });
  });

  it('marks the nested x axis and its title', () => {
    const { el } = chart({
      xAxis: { dimensions: ['region', 'cat'], title: { text: 'Region' } },
      series: [{ type: 'column', name: 'S', data: [
        { y: 3, region: 'East', cat: 'A' },
        { y: 5, region: 'West', cat: 'B' },
      ] }],
    });
    expect(el.querySelector('.facet-axis-nested')!.getAttribute('data-fv-id')).toBe('xAxis[0]');
    expect(el.querySelector('[data-fv-kind="axisTitle"][data-fv-id="xAxis[0]"]')!.textContent).toBe('Region');
  });

  it('adds no listeners or prevented menus without canvas handlers', () => {
    const el = container(600, 400);
    new FacetViz(el, { chart: { animation: false }, xAxis: { categories: ['A', 'B'] }, series: [{ type: 'column', name: 'S', data }] });
    const right = fire(el.querySelector('[data-fv-kind="plotArea"]')!, 'contextmenu');
    expect(right.defaultPrevented).toBe(false);
  });
});
