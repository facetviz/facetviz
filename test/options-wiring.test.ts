import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz, validateChartOptions } from '../src/index.js';

function container(width = 600, height = 400): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

const baseChart = {
  width: 600,
  height: 400,
  animation: false,
  reflow: false,
} as const;

describe('configuration option wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires load once after the initial render and render on every render', () => {
    const load = vi.fn();
    const render = vi.fn();
    const chart = new FacetViz(container(), {
      chart: { ...baseChart, events: { load, render } },
      series: [{ data: [1, 2] }],
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(chart);
    expect(render).toHaveBeenCalledTimes(1);
    chart.update({ title: { text: 'Updated' } });
    expect(load).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('normalizes CSS-style text options for subtitles, axes, and legends', () => {
    const el = container();
    new FacetViz(el, {
      chart: baseChart,
      subtitle: {
        text: 'Subtitle',
        style: { fontSize: '19px', fontWeight: '700', color: '#112233' },
      },
      xAxis: {
        categories: ['A'],
        title: { text: 'Category', style: { fontSize: '17px', color: '#223344' } },
        labels: { style: { fontSize: '16px', color: '#334455' } },
      },
      legend: { itemStyle: { fontSize: '18px', color: '#445566' } },
      series: [
        { name: 'Series', data: [3] },
        { name: 'Other', data: [2] },
      ],
    });

    const subtitle = [...el.querySelectorAll('text')].find((node) => node.textContent === 'Subtitle')!;
    const axisTitle = [...el.querySelectorAll('.facet-axis text')].find((node) => node.textContent === 'Category')!;
    const axisLabel = [...el.querySelectorAll('.facet-axis text')].find((node) => node.textContent === 'A')!;
    const legend = el.querySelector<SVGTextElement>('.facet-legend-item text')!;
    expect(subtitle.getAttribute('font-size')).toBe('19px');
    expect(subtitle.getAttribute('font-weight')).toBe('700');
    expect(subtitle.getAttribute('fill')).toBe('#112233');
    expect(axisTitle.getAttribute('font-size')).toBe('17px');
    expect(axisTitle.getAttribute('fill')).toBe('#223344');
    expect(axisLabel.getAttribute('font-size')).toBe('16px');
    expect(axisLabel.getAttribute('fill')).toBe('#334455');
    expect(legend.getAttribute('font-size')).toBe('18px');
    expect(legend.getAttribute('fill')).toBe('#445566');
  });

  it('uses y-axis value options and x-axis category reversal in inverted charts', () => {
    const normal = container();
    new FacetViz(normal, {
      chart: { ...baseChart, type: 'bar' },
      xAxis: { categories: ['First', 'Second'] },
      yAxis: { min: 0, max: 100, tickCount: 3 },
      series: [{ data: [25, 75] }],
    });
    const reversed = container();
    new FacetViz(reversed, {
      chart: { ...baseChart, type: 'bar' },
      xAxis: { categories: ['First', 'Second'], reversed: true },
      yAxis: { min: 0, max: 100, tickCount: 3, reversed: true },
      series: [{ data: [25, 75] }],
    });

    const bottomLabels = [...normal.querySelectorAll('.facet-axis-bottom text')].map((node) => node.textContent);
    expect(bottomLabels).toEqual(expect.arrayContaining(['0', '50', '100']));
    const normalBars = [...normal.querySelectorAll<SVGRectElement>('.facet-column .facet-point')];
    const reversedBars = [...reversed.querySelectorAll<SVGRectElement>('.facet-column .facet-point')];
    expect(Number(normalBars[0].getAttribute('x'))).toBeLessThan(Number(reversedBars[0].getAttribute('x')));
    expect(Number(normalBars[0].getAttribute('y'))).toBeLessThan(Number(normalBars[1].getAttribute('y')));
    expect(Number(reversedBars[0].getAttribute('y'))).toBeGreaterThan(Number(reversedBars[1].getAttribute('y')));
  });

  it('supports a secondary x axis and binds its series to that scale', () => {
    const el = container();
    new FacetViz(el, {
      chart: baseChart,
      xAxis: [
        { categories: ['A', 'B'] },
        {
          categories: ['Left', 'Middle', 'Right'],
          labels: { format: 'top:{value}', style: { color: '#aa0000' } },
          title: { text: 'Secondary X' },
        },
      ],
      series: [
        { name: 'Primary', data: [1, 2], marker: { enabled: true } },
        { name: 'Secondary', xAxis: 1, data: [3, 4, 5], marker: { enabled: true } },
      ],
    });

    const topLabels = [...el.querySelectorAll<SVGTextElement>('.facet-axis-top text')];
    expect(topLabels.map((node) => node.textContent)).toEqual(
      expect.arrayContaining(['top:Left', 'top:Middle', 'top:Right', 'Secondary X']),
    );
    expect(topLabels.find((node) => node.textContent === 'top:Left')?.getAttribute('fill')).toBe('#aa0000');
    expect(el.querySelectorAll('.facet-line.Secondary .facet-point')).toHaveLength(3);
  });

  it('shares trellis domains by default and makes them independent when requested', () => {
    const options = {
      chart: { ...baseChart, type: 'column' as const },
      xAxis: { categories: ['A'] },
      series: [{
        data: [
          { x: 'A', y: 10, panel: 'small' },
          { x: 'A', y: 100, panel: 'large' },
        ],
      }],
    };
    const shared = container();
    new FacetViz(shared, {
      ...options,
      trellis: { columns: 'panel', table: false, sharedY: true },
    });
    const independent = container();
    new FacetViz(independent, {
      ...options,
      trellis: { columns: 'panel', table: false, sharedY: false },
    });
    const sharedHeight = Number(shared.querySelector<SVGRectElement>('.facet-column .facet-point')?.getAttribute('height'));
    const independentHeight = Number(independent.querySelector<SVGRectElement>('.facet-column .facet-point')?.getAttribute('height'));
    expect(independentHeight).toBeGreaterThan(sharedHeight * 3);
  });

  it('honors area opacity and marker visibility and dimensions', () => {
    const area = container();
    new FacetViz(area, {
      chart: { ...baseChart, type: 'area' },
      series: [{ color: '#336699', fillOpacity: 0.72, data: [1, 3, 2] }],
    });
    expect(area.querySelector<SVGPathElement>('.facet-area path')?.getAttribute('fill'))
      .toBe('rgba(51, 102, 153, 0.72)');

    const hidden = container();
    new FacetViz(hidden, {
      chart: { ...baseChart, type: 'scatter' },
      series: [{ marker: { enabled: false }, data: [[1, 2], [2, 3]] }],
    });
    expect(hidden.querySelectorAll('.facet-scatter .facet-point')).toHaveLength(0);
    expect(hidden.querySelectorAll('.facet-scatter .facet-point-hit')).toHaveLength(2);

    const rectangle = container();
    new FacetViz(rectangle, {
      chart: { ...baseChart, type: 'scatter' },
      series: [{
        marker: { symbol: 'rectangle', width: 18, height: 8 },
        data: [[1, 2]],
      }],
    });
    const marker = rectangle.querySelector<SVGRectElement>('.facet-scatter .facet-point')!;
    expect(marker.getAttribute('width')).toBe('18');
    expect(marker.getAttribute('height')).toBe('8');
  });

  it('applies all pie data-label style options through the shared label renderer', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'pie' },
      series: [{
        dataLabels: {
          enabled: true,
          position: 'outside',
          format: '{name}',
          color: '#123456',
          fontSize: '20px',
          fontWeight: '700',
          rotation: 12,
          backgroundColor: '#ffeeaa',
        },
        data: [{ name: 'Alpha', y: 3 }, { name: 'Beta', y: 2 }],
      }],
    });
    const label = [...el.querySelectorAll<SVGTextElement>('.facet-pie text')]
      .find((node) => node.textContent === 'Alpha')!;
    expect(label.getAttribute('fill')).toBe('#123456');
    expect(label.getAttribute('font-size')).toBe('20px');
    expect(label.getAttribute('font-weight')).toBe('700');
    expect(label.getAttribute('transform')).toContain('rotate(12');
    expect(el.querySelector('.facet-pie rect[fill="#ffeeaa"]')).toBeTruthy();
  });

  it('forwards hover events for self-contained, radar, and marimekko series', () => {
    const mouseOver = vi.fn();
    const mouseOut = vi.fn();
    const gauge = container();
    new FacetViz(gauge, {
      chart: { ...baseChart, type: 'gauge' },
      seriesEvents: { mouseOver, mouseOut },
      series: [{ data: [42] }],
    });
    const needle = gauge.querySelector<SVGElement>('.facet-gauge .facet-point')!;
    needle.dispatchEvent(new MouseEvent('mouseover'));
    needle.dispatchEvent(new MouseEvent('mouseout'));

    const radar = container();
    new FacetViz(radar, {
      chart: { ...baseChart, type: 'radar' },
      xAxis: { categories: ['A', 'B', 'C'] },
      seriesEvents: { mouseOver, mouseOut },
      series: [{ marker: { enabled: false }, data: [1, 2, 3] }],
    });
    const radarHit = radar.querySelector<SVGElement>('.facet-radar .facet-point-hit')!;
    radarHit.dispatchEvent(new MouseEvent('mouseover'));
    radarHit.dispatchEvent(new MouseEvent('mouseout'));

    const mekko = container();
    new FacetViz(mekko, {
      chart: { ...baseChart, type: 'marimekko' },
      xAxis: { categories: ['A'] },
      seriesEvents: { mouseOver, mouseOut },
      series: [{ data: [3] }],
    });
    const cell = mekko.querySelector<SVGElement>('.facet-marimekko .facet-point')!;
    cell.dispatchEvent(new MouseEvent('mouseover'));
    cell.dispatchEvent(new MouseEvent('mouseout'));
    expect(mouseOver).toHaveBeenCalledTimes(3);
    expect(mouseOut).toHaveBeenCalledTimes(3);
  });

  it('fires legend callbacks for custom multi-level pie legend providers', () => {
    const legendItemClick = vi.fn();
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'donut' },
      seriesEvents: { legendItemClick },
      series: [{
        dimensions: ['group', 'item'],
        data: [
          { name: 'One', y: 2, group: 'Group A', item: 'One' },
          { name: 'Two', y: 3, group: 'Group A', item: 'Two' },
          { name: 'Three', y: 4, group: 'Group B', item: 'Three' },
        ],
      }],
    });
    el.querySelector<SVGGElement>('.facet-legend-item')!
      .dispatchEvent(new MouseEvent('click'));
    expect(legendItemClick).toHaveBeenCalledWith({
      series: 'Group A',
      visible: false,
    });
  });

  it('wires nested-axis labels, title, and line/grid colors', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'column' },
      xAxis: {
        dimensions: ['region', 'quarter'],
        labels: {
          format: 'N:{value}',
          style: { fontSize: '15px', color: '#334455' },
        },
        title: { text: 'Nested title', style: { color: '#556677' } },
        lineColor: '#778899',
        gridLineColor: '#99aabb',
        gridLineWidth: 2,
      },
      series: [{
        data: [
          { y: 2, region: 'East', quarter: 'Q1' },
          { y: 3, region: 'East', quarter: 'Q2' },
          { y: 4, region: 'West', quarter: 'Q1' },
        ],
      }],
    });
    const nested = el.querySelector<SVGGElement>('.facet-axis-nested')!;
    const label = [...nested.querySelectorAll('text')].find((node) => node.textContent === 'N:Q1')!;
    const title = [...nested.querySelectorAll('text')].find((node) => node.textContent === 'Nested title')!;
    expect(label.getAttribute('font-size')).toBe('15px');
    expect(label.getAttribute('fill')).toBe('#334455');
    expect(title.getAttribute('fill')).toBe('#556677');
    expect([...nested.querySelectorAll('line')].some((line) => line.getAttribute('stroke') === '#778899')).toBe(true);
    expect([...nested.querySelectorAll('line')].some((line) =>
      line.getAttribute('stroke') === '#99aabb' && line.getAttribute('stroke-width') === '2',
    )).toBe(true);
  });

  it('keeps boosted series styling equivalent to SVG rendering', () => {
    const ctx = {
      scale: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

    new FacetViz(container(), {
      chart: { ...baseChart, type: 'scatter', boost: true },
      series: [{
        color: '#336699',
        marker: {
          symbol: 'rectangle',
          width: 18,
          height: 8,
          fillColor: '#abcdef',
          lineColor: '#123456',
          lineWidth: 3,
        },
        data: [[1, 2]],
      }],
    });

    expect(ctx.rect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 18, 8);
    expect(ctx.fillStyle).toBe('#abcdef');
    expect(ctx.strokeStyle).toBe('#123456');
    expect(ctx.lineWidth).toBe(3);
  });

  it('rejects unsupported third axes instead of silently ignoring them', () => {
    const result = validateChartOptions({
      xAxis: [{}, {}, {}],
      yAxis: [{}, {}, {}],
      series: [{ xAxis: 2, yAxis: 2, data: [1] }],
    });
    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['axis.count.maximum', 'series.x_axis.index', 'series.y_axis.index']),
    );
  });
});
