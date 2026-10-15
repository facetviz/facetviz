import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FacetViz, validateChartOptions } from '../src/index.js';
import { chartFontScale } from '../src/core/theme.js';

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

  it('formats or hides heatmap cell and funnel stage labels through dataLabels', () => {
    const texts = (el: HTMLElement, cls: string) => [...el.querySelectorAll(`.${cls} text`)].map((t) => t.textContent);
    const cells = [{ x: 'a', y: 'r', value: 1500 }, { x: 'b', y: 'r', value: 2500 }];
    const heat = container();
    new FacetViz(heat, { chart: { ...baseChart, type: 'heatmap' }, series: [{ type: 'heatmap', data: cells }] });
    expect(texts(heat, 'facet-heatmap')).toContain('1500');
    const formatted = container();
    new FacetViz(formatted, {
      chart: { ...baseChart, type: 'heatmap' },
      series: [{ type: 'heatmap', data: cells, dataLabels: { formatter: (c) => `${Number(c.y) / 1000}K` } }],
    });
    expect(texts(formatted, 'facet-heatmap')).toEqual(expect.arrayContaining(['1.5K', '2.5K']));
    const hidden = container();
    new FacetViz(hidden, { chart: { ...baseChart, type: 'heatmap' }, series: [{ type: 'heatmap', data: cells, dataLabels: { enabled: false } }] });
    expect(texts(hidden, 'facet-heatmap')).not.toContain('1500');

    const stages = [{ name: 'Visits', y: 1200 }, { name: 'Orders', y: 300 }];
    const funnel = container();
    new FacetViz(funnel, { chart: { ...baseChart, type: 'funnel' }, series: [{ type: 'funnel', data: stages }] });
    expect(texts(funnel, 'facet-funnel')).toEqual(['Visits: 1200', 'Orders: 300']);
    const named = container();
    new FacetViz(named, {
      chart: { ...baseChart, type: 'funnel' },
      series: [{ type: 'funnel', data: stages, dataLabels: { formatter: (c) => `${c.name} (${c.index})` } }],
    });
    expect(texts(named, 'facet-funnel')).toEqual(['Visits (0)', 'Orders (1)']);
    const none = container();
    new FacetViz(none, { chart: { ...baseChart, type: 'funnel' }, series: [{ type: 'funnel', data: stages, dataLabels: { enabled: false } }] });
    expect(texts(none, 'facet-funnel')).toEqual([]);
  });

  it('aligns column and bar labels across the bar with crossAlign', () => {
    const draw = (type: 'column' | 'bar', crossAlign?: 'start' | 'center' | 'end') => {
      const el = container();
      new FacetViz(el, {
        chart: { ...baseChart, type },
        xAxis: { categories: ['a'] },
        series: [{ type, data: [5], dataLabels: { enabled: true, crossAlign } }],
      });
      const rect = el.querySelector<SVGRectElement>(".facet-column rect")!;
      const label = [...el.querySelectorAll<SVGTextElement>(".facet-column text")].find((t) => t.textContent === '5')!;
      const r = (k: string) => Number(rect.getAttribute(k));
      return { x: r('x'), y: r('y'), w: r('width'), h: r('height'), lx: Number(label.getAttribute('x')), ly: Number(label.getAttribute('y')), anchor: label.getAttribute('text-anchor'), baseline: label.getAttribute('dominant-baseline') };
    };
    const left = draw('column', 'start');
    expect(left.anchor).toBe('start');
    expect(left.lx).toBeCloseTo(left.x + 2);
    const right = draw('column', 'end');
    expect(right.anchor).toBe('end');
    expect(right.lx).toBeCloseTo(right.x + right.w - 2);
    expect(draw('column').anchor).toBe('middle');

    const top = draw('bar', 'start');
    expect(top.baseline).toBe('hanging');
    expect(top.ly).toBeCloseTo(top.y + 1);
    const bottom = draw('bar', 'end');
    expect(bottom.baseline).toBeNull();
    expect(bottom.ly).toBeCloseTo(bottom.y + bottom.h - 2);
    expect(draw('bar').baseline).toBe('middle');
  });

  it('nudges data labels by offsetX and offsetY', () => {
    const draw = (type: 'column' | 'line', offsets: { offsetX?: number; offsetY?: number } = {}) => {
      const el = container();
      new FacetViz(el, {
        chart: { ...baseChart, type },
        xAxis: { categories: ['a', 'b'] },
        series: [{ type, data: [5, 7], dataLabels: { enabled: true, ...offsets } }],
      });
      const label = [...el.querySelectorAll<SVGTextElement>(`.facet-${type} text`)].find((t) => t.textContent === '5')!;
      return { x: Number(label.getAttribute('x')), y: Number(label.getAttribute('y')) };
    };
    for (const type of ['column', 'line'] as const) {
      const base = draw(type);
      const moved = draw(type, { offsetX: -3, offsetY: 6 });
      expect(moved.x).toBeCloseTo(base.x - 3);
      expect(moved.y).toBeCloseTo(base.y + 6);
    }
  });

  it('nudges heatmap, funnel and treemap labels by offsetX and offsetY', () => {
    const at = (type: 'heatmap' | 'funnel' | 'treemap', offsets: { offsetX?: number; offsetY?: number } = {}) => {
      const el = container();
      const data = type === 'heatmap' ? [{ x: 'a', y: 'r', value: 5 }] : [{ name: 'a', y: 5 }, { name: 'b', y: 3 }];
      new FacetViz(el, { chart: { ...baseChart, type }, series: [{ type, data, dataLabels: { enabled: true, ...offsets } }] } as never);
      const t = el.querySelector<SVGTextElement>(`.facet-${type} text`)!;
      return { x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) };
    };
    for (const type of ['heatmap', 'funnel', 'treemap'] as const) {
      const base = at(type);
      const moved = at(type, { offsetX: 4, offsetY: -5 });
      expect(moved.x, type).toBeCloseTo(base.x + 4);
      expect(moved.y, type).toBeCloseTo(base.y - 5);
    }
  });

  it('labels waterfall steps with their change, and sums with the total', () => {
    const draw = (offsets: { offsetX?: number; offsetY?: number } = {}) => {
      const el = container();
      new FacetViz(el, {
        chart: { ...baseChart, type: 'waterfall' },
        xAxis: { categories: ['a', 'b', 'c'] },
        series: [{ type: 'waterfall', data: [10, -4, { y: 0, isSum: true }], dataLabels: { enabled: true, ...offsets } }],
      } as never);
      return [...el.querySelectorAll<SVGTextElement>('.facet-waterfall text')].map((t) => ({ text: t.textContent, x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) }));
    };
    const base = draw();
    expect(base.map((l) => l.text)).toEqual(['10', '-4', '6']);
    const moved = draw({ offsetX: 2, offsetY: -3 });
    moved.forEach((l, i) => {
      expect(l.x).toBeCloseTo(base[i].x + 2);
      expect(l.y).toBeCloseTo(base[i].y - 3);
    });
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
      chart: { ...baseChart, scaleFonts: false },
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

  it('offsets Cartesian labels away from the axis line and reserves the gap', () => {
    const el = container();
    new FacetViz(el, {
      chart: baseChart,
      xAxis: {
        categories: ['A', 'B'],
        labels: { offset: 20 },
        title: { text: 'Category', margin: 9 },
      },
      series: [{ data: [2, 4] }],
    });

    const axis = el.querySelector<SVGGElement>('.facet-axis-bottom')!;
    const baseline = axis.querySelector<SVGLineElement>('line')!;
    const label = [...axis.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'A')!;
    const title = [...axis.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Category')!;
    const axisY = Number(baseline.getAttribute('y1'));

    expect(Number(label.getAttribute('y')) - axisY).toBe(32);
    expect(Number(title.getAttribute('y'))).toBeGreaterThan(
      Number(label.getAttribute('y')),
    );
    expect(Number(label.getAttribute('y'))).toBeLessThan(400);
  });

  it('controls legend margin, padding, offsets, and internal gaps', () => {
    const el = container();
    new FacetViz(el, {
      chart: baseChart,
      legend: {
        layout: 'vertical',
        align: 'left',
        margin: 20,
        padding: 7,
        offsetX: 5,
        offsetY: 4,
        symbolPadding: 13,
        rowGap: 15,
      },
      series: [
        { name: 'First', data: [2, 4] },
        { name: 'Second', data: [3, 5] },
      ],
    });

    const items = [
      ...el.querySelectorAll<SVGGElement>('.facet-legend-item'),
    ];
    const firstRect = items[0].querySelector<SVGRectElement>('rect')!;
    const firstText = items[0].querySelector<SVGTextElement>('text')!;
    const secondText = items[1].querySelector<SVGTextElement>('text')!;

    // Left chart spacing (16) + offsetX (5) + legend padding (7).
    expect(firstRect.getAttribute('x')).toBe('28');
    expect(
      Number(firstText.getAttribute('x')) - Number(firstRect.getAttribute('x')),
    ).toBe(25);
    expect(
      Number(secondText.getAttribute('y')) - Number(firstText.getAttribute('y')),
    ).toBeCloseTo(
      12 * chartFontScale(baseChart.width, baseChart.height) * 1.2 + 15,
    );
    expect(Number(firstText.getAttribute('y'))).toBeGreaterThan(16 + 4);
  });

  it('uses itemGap when spacing a horizontal legend row', () => {
    const positions = (itemGap: number): number[] => {
      const el = container();
      new FacetViz(el, {
        chart: baseChart,
        legend: { align: 'left', itemGap },
        series: [
          { name: 'One', data: [1] },
          { name: 'Two', data: [2] },
        ],
      });
      return [...el.querySelectorAll<SVGRectElement>('.facet-legend-item rect')]
        .map((rect) => Number(rect.getAttribute('x')));
    };

    const compact = positions(0);
    const spaced = positions(24);
    expect(spaced[1] - spaced[0]).toBe((compact[1] - compact[0]) + 24);
  });

  it('compacts default axis-title and legend gaps to prioritize a small plot', () => {
    const layout = (
      responsive: boolean,
      margins?: { axis: number; legend: number },
    ) => {
      const el = container(320, 220);
      new FacetViz(el, {
        chart: {
          ...baseChart,
          width: 320,
          height: 220,
          responsive,
          scaleFonts: false,
        },
        xAxis: {
          categories: ['A', 'B', 'C'],
          labels: { style: { fontSize: '11px' } },
          title: {
            text: 'Route',
            margin: margins?.axis,
            style: { fontSize: '12px' },
          },
        },
        legend: {
          margin: margins?.legend,
          itemStyle: { fontSize: '12px' },
        },
        series: [
          { name: 'Cab', data: [2, 4, 3] },
          { name: 'Train', data: [3, 2, 5] },
        ],
      });

      const axis = el.querySelector<SVGGElement>('.facet-axis-bottom')!;
      const baseline = [...axis.querySelectorAll<SVGLineElement>('line')]
        .find((line) => line.getAttribute('x1') !== line.getAttribute('x2'))!;
      const text = (value: string, root: ParentNode = el) =>
        [...root.querySelectorAll<SVGTextElement>('text')]
          .find((node) => node.textContent === value)!;
      return {
        plotBottom: Number(baseline.getAttribute('y1')),
        labelY: Number(text('A', axis).getAttribute('y')),
        titleY: Number(text('Route', axis).getAttribute('y')),
        legendY: Number(text('Cab').getAttribute('y')),
      };
    };

    const compact = layout(true);
    const full = layout(false);

    expect(compact.plotBottom - full.plotBottom).toBeGreaterThan(25);
    expect(compact.titleY - compact.labelY).toBeLessThan(
      full.titleY - full.labelY - 10,
    );
    expect(compact.legendY - compact.titleY).toBeLessThan(
      full.legendY - full.titleY - 10,
    );

    // User-authored margins stay literal even when responsive layout is on.
    const explicit = layout(true, { axis: 22, legend: 22 });
    expect(explicit.plotBottom).toBeCloseTo(full.plotBottom);
    expect(explicit.titleY).toBeCloseTo(full.titleY);
    expect(explicit.legendY).toBeCloseTo(full.legendY);
  });

  it('positions and customizes chart text with alignment and offsets', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, scaleFonts: false },
      texts: [
        {
          text: 'First line\nSecond line',
          align: 'center',
          verticalAlign: 'center',
          offsetX: 10,
          offsetY: -5,
          lineHeight: 24,
          rotation: 15,
          color: '#123456',
          className: 'custom-note',
          style: { fontSize: '20px', fontWeight: '700' },
        },
        {
          text: 'Bottom right',
          align: 'right',
          verticalAlign: 'bottom',
          offsetX: -12,
          offsetY: -8,
        },
        {
          text: 'Top edge',
          align: 'center',
          verticalAlign: 'top',
          style: { fontSize: '16px' },
        },
        { text: 'Hidden', enabled: false },
      ],
      series: [{ data: [1, 2] }],
    });

    const note = el.querySelector<SVGGElement>('.facet-chart-text.custom-note')!;
    const text = note.querySelector<SVGTextElement>('.facet-chart-text-content')!;
    expect(note.getAttribute('transform')).toBe('rotate(15 310 195)');
    expect(text.getAttribute('x')).toBe('310');
    expect(text.getAttribute('text-anchor')).toBe('middle');
    expect(text.getAttribute('font-size')).toBe('20px');
    expect(text.getAttribute('font-weight')).toBe('700');
    expect(text.getAttribute('fill')).toBe('#123456');
    expect([...text.querySelectorAll('tspan')].map((line) => line.textContent))
      .toEqual(['First line', 'Second line']);
    const textLayer = el.querySelector('.facet-chart-texts')!;
    const series = el.querySelector('.facet-series')!;
    expect(Boolean(series.compareDocumentPosition(textLayer) & Node.DOCUMENT_POSITION_FOLLOWING))
      .toBe(true);
    expect([...textLayer.querySelectorAll<SVGTextElement>('.facet-chart-text-content')]
      .find((node) => node.textContent === 'Bottom right')?.getAttribute('x')).toBe('588');
    const topText = [...el.querySelectorAll<SVGTextElement>('.facet-chart-text-content')]
      .find((node) => node.textContent === 'Top edge')!;
    expect(topText.getAttribute('y')).toBe('16');
    expect(topText.querySelector('tspan')?.getAttribute('y')).toBe('16');
    expect(topText.getAttribute('dominant-baseline')).toBe('auto');
    expect([...el.querySelectorAll('.facet-chart-text-content')]
      .some((node) => node.textContent === 'Hidden')).toBe(false);
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

    const gradientArea = container();
    new FacetViz(gradientArea, {
      chart: { ...baseChart, type: 'area' },
      series: [{
        color: '#336699',
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#2caffe', 0.8], [1, '#544fc5', 0.1]],
        },
        data: [1, 3, 2],
      }],
    });
    const gradient = gradientArea.querySelector<SVGLinearGradientElement>('linearGradient')!;
    const gradientStops = [...gradient.querySelectorAll('stop')];
    expect(gradient.getAttribute('x1')).toBe('0');
    expect(gradient.getAttribute('y2')).toBe('1');
    expect(gradient.getAttribute('gradientUnits')).toBe('objectBoundingBox');
    expect(gradientStops.map((stop) => [
      stop.getAttribute('offset'),
      stop.getAttribute('stop-color'),
      stop.getAttribute('stop-opacity'),
    ])).toEqual([
      ['0', '#2caffe', '0.8'],
      ['1', '#544fc5', '0.1'],
    ]);
    expect(
      gradientArea.querySelector<SVGPathElement>(".facet-area path:not([fill='none'])")
        ?.getAttribute('fill'),
    ).toBe(`url(#${gradient.id})`);

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
    const markerScale = chartFontScale(baseChart.width, baseChart.height);
    expect(marker.getAttribute('width')).toBe(`${18 * markerScale}`);
    expect(marker.getAttribute('height')).toBe(`${8 * markerScale}`);
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
    // An explicit dataLabels.fontSize scales with chart.scaleFonts (default
    // on) the same way yAxis label / legend / title font sizes do, rather
    // than staying frozen at the literal px the caller wrote.
    expect(label.getAttribute('font-size'))
      .toBe(`${20 * chartFontScale(baseChart.width, baseChart.height)}px`);
    expect(label.getAttribute('font-weight')).toBe('700');
    expect(label.getAttribute('transform')).toContain('rotate(12');
    expect(el.querySelector('.facet-pie rect[fill="#ffeeaa"]')).toBeTruthy();
  });

  it.each([
    ['left', 'start'],
    ['center', 'middle'],
    ['right', 'end'],
  ] as const)('aligns data labels %s', (align, anchor) => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'line' },
      xAxis: { categories: ['A'] },
      series: [{
        dataLabels: { enabled: true, format: 'value:{y}', align },
        data: [5],
      }],
    });

    const label = [...el.querySelectorAll<SVGTextElement>('.facet-series text')]
      .find((node) => node.textContent === 'value:5');
    expect(label?.getAttribute('text-anchor')).toBe(anchor);
  });

  it.each(['column', 'bar'] as const)(
    'centers %s data labels on the bar rectangle',
    (type) => {
      const el = container();
      new FacetViz(el, {
        chart: { ...baseChart, type },
        xAxis: { categories: ['A'] },
        series: [{
          dataLabels: { enabled: true, format: 'value:{y}', position: 'center' },
          data: [5],
        }],
      });

      const bar = el.querySelector<SVGRectElement>('.facet-column .facet-point')!;
      const label = [...el.querySelectorAll<SVGTextElement>('.facet-column text')]
        .find((node) => node.textContent === 'value:5')!;
      const centerX = Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2;
      const centerY = Number(bar.getAttribute('y')) + Number(bar.getAttribute('height')) / 2;

      expect(Number(label.getAttribute('x'))).toBeCloseTo(centerX);
      expect(Number(label.getAttribute('y'))).toBeCloseTo(centerY);
      expect(label.getAttribute('text-anchor')).toBe('middle');
      expect(label.getAttribute('dominant-baseline')).toBe('middle');
    },
  );

  it('places pie labels inside when they fit and moves small-sector labels outside', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'pie' },
      series: [{
        dataLabels: { enabled: true, format: '{name}' },
        data: [
          { name: 'Large', y: 90 },
          { name: 'A label too wide for this small sector', y: 10 },
        ],
      }],
    });

    const labels = [...el.querySelectorAll<SVGTextElement>('.facet-pie text')];
    const large = labels.find((label) => label.textContent === 'Large');
    const small = labels.find((label) => label.textContent === 'A label too wide for this small sector');
    expect(large?.getAttribute('fill')).toBe('#ffffff');
    expect(small?.getAttribute('fill')).toBe('#333333');
    expect(el.querySelectorAll('.facet-pie polyline')).toHaveLength(1);
  });

  it('hides data labels on very small charts and restores them when the chart grows', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { ...baseChart, width: 160, height: 160 },
      xAxis: { categories: ['A'] },
      series: [{
        dataLabels: { enabled: true, format: 'value:{y}' },
        data: [5],
      }],
    });

    expect([...el.querySelectorAll('.facet-series text')]
      .some((node) => node.textContent === 'value:5')).toBe(false);
    expect(chart.series[0].options.dataLabels?.enabled).toBe(true);

    chart.setSize(240, 240);
    expect([...el.querySelectorAll('.facet-series text')]
      .some((node) => node.textContent === 'value:5')).toBe(true);
  });

  it('judges data-label room by the plot area, not the whole chart', () => {
    const hasLabel = (el: HTMLElement) => [...el.querySelectorAll('.facet-series text')]
      .some((node) => node.textContent === 'value:5');
    const series = [{ dataLabels: { enabled: true, format: 'value:{y}' }, data: [5] }];

    // Wide and short: the chart's short side is small, but its plot still
    // has room for a label.
    const wide = container();
    new FacetViz(wide, {
      chart: { ...baseChart, width: 600, height: 170 },
      xAxis: { categories: ['A'] },
      series,
    });
    expect(hasLabel(wide)).toBe(true);

    // A roomy chart whose title, subtitle and axes leave a cramped plot.
    const cramped = container();
    new FacetViz(cramped, {
      chart: { ...baseChart, width: 600, height: 190 },
      title: { text: 'Title' },
      subtitle: { text: 'Subtitle' },
      xAxis: { categories: ['A'], title: { text: 'Category' } },
      series,
    });
    expect(hasLabel(cramped)).toBe(false);
  });

  it('keeps stacked segment labels on a small plot when each one fits its segment', () => {
    const labels = (el: HTMLElement) => [...el.querySelectorAll('.facet-series text')]
      .map((node) => node.textContent);
    const options = (stacking?: 'normal') => ({
      chart: { ...baseChart, type: 'column' as const, width: 400, height: 140 },
      xAxis: { categories: ['A'] },
      plotOptions: { series: { stacking } },
      series: [
        { dataLabels: { enabled: true, format: 'big:{y}' }, data: [50] },
        { dataLabels: { enabled: true, format: 'tiny:{y}' }, data: [1] },
      ],
    });

    // The plot is under the small-plot threshold, yet the tall segment
    // keeps its label; the sliver of a segment drops its own.
    const stacked = container();
    new FacetViz(stacked, options('normal'));
    expect(labels(stacked)).toContain('big:50');
    expect(labels(stacked)).not.toContain('tiny:1');

    // Side-by-side columns still follow the plot-size gate.
    const grouped = container();
    new FacetViz(grouped, options());
    expect(labels(grouped)).not.toContain('big:50');
  });

  it('drops a stacked segment label wider than its column', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'column', width: 400, height: 300 },
      xAxis: { categories: Array.from({ length: 30 }, (_, i) => `c${i}`) },
      plotOptions: { series: { stacking: 'normal' } },
      series: [{ dataLabels: { enabled: true, format: 'a long label {y}' }, data: Array(30).fill(10) }],
    });
    expect([...el.querySelectorAll('.facet-series text')]
      .some((node) => node.textContent?.startsWith('a long label'))).toBe(false);
  });

  it('keeps data labels on small charts when responsive rendering is disabled', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, width: 120, height: 120, responsive: false },
      xAxis: { categories: ['A'] },
      series: [{
        dataLabels: { enabled: true, format: 'value:{y}' },
        data: [5],
      }],
    });

    expect([...el.querySelectorAll('.facet-series text')]
      .some((node) => node.textContent === 'value:5')).toBe(true);
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

  it('inherits gauge markers from plotOptions and allows a series override', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'gauge' },
      plotOptions: {
        gauge: {
          markers: [{ value: 75, label: 'Default target' }],
        },
      },
      series: [
        {
          name: 'Custom',
          markers: [{ value: 50, label: 'Custom target' }],
          data: [40],
        },
        {
          name: 'Default',
          data: [60],
        },
      ],
    });

    const labels = [...el.querySelectorAll('.facet-gauge-marker-label')]
      .map((node) => node.textContent);
    expect(labels).toEqual(['Custom target', 'Default target']);
    expect(el.querySelectorAll('.facet-gauge-marker')).toHaveLength(2);
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
      chart: { ...baseChart, type: 'column', scaleFonts: false },
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
        alternateGridColor: '#f5f7fa',
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
    expect(el.querySelectorAll('.facet-alternate-grid-band')).toHaveLength(1);
  });

  it('offsets nested-axis label tiers away from their baselines', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'column' },
      xAxis: {
        dimensions: ['region', 'quarter'],
        labels: { offset: 11 },
      },
      series: [{
        data: [
          { y: 2, region: 'East', quarter: 'Q1' },
          { y: 3, region: 'East', quarter: 'Q2' },
        ],
      }],
    });

    const nested = el.querySelector<SVGGElement>('.facet-axis-nested')!;
    const label = [...nested.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Q1')!;
    const baseline = [...nested.querySelectorAll<SVGLineElement>('line')]
      .find((line) => line.getAttribute('y1') === line.getAttribute('y2'))!;
    expect(
      Number(label.getAttribute('y')) - Number(baseline.getAttribute('y1')),
    ).toBe(28);
  });

  it('extends every nested category separator through the plot', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'column', responsive: false },
      xAxis: {
        dimensions: ['product', 'category', 'city'],
        lineColor: '#123456',
        title: { text: 'Product / Category / City' },
      },
      series: [{
        data: [
          { y: 2, product: 'Bread', category: 'Beverages', city: 'Chennai' },
          { y: 3, product: 'Bread', category: 'Beverages', city: 'Bengaluru' },
          { y: 4, product: 'Bread', category: 'Grocery', city: 'Chennai' },
          { y: 5, product: 'Eggs', category: 'Grocery', city: 'Chennai' },
        ],
      }],
    });

    const nested = el.querySelector<SVGGElement>('.facet-axis-nested')!;
    const separators = [...nested.querySelectorAll<SVGLineElement>(
      '.facet-nested-group-separator',
    )];
    const baseline = [...nested.querySelectorAll<SVGLineElement>('line')]
      .find((line) =>
        line.getAttribute('y1') === line.getAttribute('y2') &&
        line.getAttribute('stroke') === '#123456'
      )!;
    const baselineY = Number(baseline.getAttribute('y1'));

    expect(separators).toHaveLength(3);
    expect(new Set(separators.map((line) => line.getAttribute('y1'))).size).toBe(1);
    expect(separators.every((line) =>
      line.getAttribute('x1') === line.getAttribute('x2') &&
      Number(line.getAttribute('y1')) < baselineY
    )).toBe(true);

    // A city-only boundary stops at the x-axis baseline. Category and product
    // boundaries extend progressively farther through their grouping rows.
    const labelExtents = separators
      .map((line) => Number(line.getAttribute('y2')) - baselineY)
      .sort((a, b) => a - b);
    expect(labelExtents[0]).toBe(0);
    expect(labelExtents[0]).toBeLessThan(labelExtents[1]);
    expect(labelExtents[1]).toBeLessThan(labelExtents[2]);

    const title = [...nested.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Product / Category / City')!;
    const farthestSeparator = Math.max(
      ...separators.map((line) => Number(line.getAttribute('y2'))),
    );
    expect(Number(title.getAttribute('y')) - farthestSeparator).toBe(22);
  });

  it('keeps the nested-axis title clear of separators when opposite is true', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'column', responsive: false },
      xAxis: {
        dimensions: ['product', 'category', 'city'],
        opposite: true,
        title: { text: 'Split nested title' },
      },
      series: [{
        data: [
          { y: 2, product: 'Bread', category: 'Beverages', city: 'Chennai' },
          { y: 3, product: 'Bread', category: 'Beverages', city: 'Bengaluru' },
          { y: 4, product: 'Bread', category: 'Grocery', city: 'Chennai' },
          { y: 5, product: 'Eggs', category: 'Grocery', city: 'Chennai' },
        ],
      }],
    });

    const nested = el.querySelector<SVGGElement>('.facet-axis-nested')!;
    const title = [...nested.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Split nested title')!;
    const separators = [...nested.querySelectorAll<SVGLineElement>(
      '.facet-nested-group-separator',
    )];
    const farthestSeparator = Math.max(
      ...separators.map((line) => Number(line.getAttribute('y2'))),
    );
    const productLabel = [...nested.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Bread')!;
    const categoryLabel = [...nested.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Beverages')!;
    const baseline = [...nested.querySelectorAll<SVGLineElement>('line')]
      .find((line) => line.getAttribute('y1') === line.getAttribute('y2'))!;
    const baselineY = Number(baseline.getAttribute('y1'));
    const separatorExtensions = separators
      .map((line) => Number(line.getAttribute('y2')) - baselineY)
      .sort((a, b) => a - b);

    expect(
      Number(title.getAttribute('y')) - farthestSeparator,
    ).toBeGreaterThanOrEqual(22);
    expect(
      Number(categoryLabel.getAttribute('y')) -
      Number(productLabel.getAttribute('y')),
    ).toBe(24);
    expect(separatorExtensions[0]).toBe(0);
    expect(separatorExtensions[2] - separatorExtensions[1]).toBe(6);
  });

  it('renders configurable dashed major and minor grid lines', () => {
    const el = container();
    new FacetViz(el, {
      chart: { ...baseChart, type: 'line' },
      yAxis: {
        min: 0,
        max: 10,
        tickCount: 3,
        gridLineColor: '#aabbcc',
        gridLineWidth: 2,
        gridLineDashStyle: '6 3',
        minorTickInterval: 'auto',
        minorGridLineColor: '#ddeeff',
        minorGridLineWidth: 0.5,
        minorGridLineDashStyle: '1 4',
      },
      series: [{ data: [2, 8] }],
    });

    const major = [...el.querySelectorAll<SVGLineElement>('.facet-gridline')];
    const minor = [...el.querySelectorAll<SVGLineElement>('.facet-minor-gridline')];
    expect(major.length).toBeGreaterThan(1);
    expect(minor).toHaveLength((major.length - 1) * 4);
    expect(major[0].getAttribute('stroke')).toBe('#aabbcc');
    expect(major[0].getAttribute('stroke-width')).toBe('2');
    expect(major[0].getAttribute('stroke-dasharray')).toBe('6 3');
    expect(minor[0].getAttribute('stroke')).toBe('#ddeeff');
    expect(minor[0].getAttribute('stroke-width')).toBe('0.5');
    expect(minor[0].getAttribute('stroke-dasharray')).toBe('1 4');

    const polar = container();
    new FacetViz(polar, {
      chart: { ...baseChart, type: 'line', polar: true },
      xAxis: { categories: ['A', 'B', 'C'] },
      yAxis: {
        min: 0,
        max: 10,
        tickCount: 3,
        minorTickInterval: 'auto',
        minorGridLineDashStyle: '3 5',
      },
      series: [{ data: [2, 8, 5] }],
    });
    const minorRing = polar.querySelector<SVGCircleElement>(
      '.facet-minor-gridline.facet-polar-minor-ring',
    );
    expect(minorRing).toBeTruthy();
    expect(minorRing?.getAttribute('stroke-dasharray')).toBe('3 5');
  });

  it('fills alternate x-axis category areas behind the series', () => {
    const columns = container();
    new FacetViz(columns, {
      chart: { ...baseChart, type: 'column' },
      xAxis: {
        categories: ['A', 'B', 'C', 'D'],
        alternateGridColor: '#f0f4ff',
      },
      series: [{ data: [2, 4, 3, 5] }],
    });

    const columnBands = [
      ...columns.querySelectorAll<SVGRectElement>(
        '.facet-axis-bottom .facet-alternate-grid-band',
      ),
    ];
    expect(columnBands).toHaveLength(2);
    expect(columnBands.map((band) => band.getAttribute('fill'))).toEqual([
      '#f0f4ff',
      '#f0f4ff',
    ]);
    expect(
      columnBands.every(
        (band) =>
          Number(band.getAttribute('height')) >
          Number(band.getAttribute('width')),
      ),
    ).toBe(true);

    const bars = container();
    new FacetViz(bars, {
      chart: { ...baseChart, type: 'bar' },
      xAxis: {
        categories: ['A', 'B', 'C', 'D'],
        alternateGridColor: 'rgba(10, 20, 30, 0.08)',
      },
      series: [{ data: [2, 4, 3, 5] }],
    });
    const rowBands = [
      ...bars.querySelectorAll<SVGRectElement>(
        '.facet-axis-left .facet-alternate-grid-band',
      ),
    ];
    expect(rowBands).toHaveLength(2);
    expect(
      rowBands.every(
        (band) =>
          Number(band.getAttribute('width')) >
          Number(band.getAttribute('height')),
      ),
    ).toBe(true);
  });

  it('validates alternateGridColor as a CSS colour string', () => {
    const issues = validateChartOptions({
      xAxis: { alternateGridColor: 42 } as never,
      series: [{ data: [1] }],
    });
    expect(issues.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'axis.alternate_grid_color.string',
          path: 'xAxis.alternateGridColor',
        }),
      ]),
    );
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
