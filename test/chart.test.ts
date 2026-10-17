import { describe, it, expect, beforeEach } from 'vitest';
import { FacetViz } from '../src/index.js';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('FacetViz rendering', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders an SVG for a column chart', () => {
    const el = container();
    new FacetViz(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A', 'B'] }, series: [{ name: 'S', data: [3, 5] }] });
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(el.querySelectorAll('.facet-column .facet-point').length).toBe(2);
  });

  it('fits a log value axis to positive column values, not the zero baseline', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      yAxis: { type: 'log' },
      xAxis: { categories: ['A', 'B', 'C', 'D'] },
      series: [{ data: [120000, 450000, 900000, 3000] }],
    });
    const ticks = [...el.querySelectorAll('.facet-axis-left text')]
      .map((node) => Number(node.textContent))
      .filter(Number.isFinite);
    expect(ticks).toEqual([1000, 10000, 100000, 1000000]);
    const bottoms = [...el.querySelectorAll('.facet-column .facet-point')].map(
      (node) => Number(node.getAttribute('y')) + Number(node.getAttribute('height')),
    );
    expect(new Set(bottoms.map((b) => b.toFixed(3))).size).toBe(1);
  });

  it('adds breathing room beyond automatic y-axis data extrema', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'line', animation: false },
      xAxis: { categories: ['Low', 'High'] },
      series: [{ data: [-10, 10] }],
    });

    const ticks = [...el.querySelectorAll('.facet-axis-left text')]
      .map((node) => Number(node.textContent))
      .filter(Number.isFinite);
    expect(Math.min(...ticks)).toBeLessThan(-10);
    expect(Math.max(...ticks)).toBeGreaterThan(10);
  });

  it.each([
    ['column', '.facet-axis-left'],
    ['bar', '.facet-axis-bottom'],
    ['area', '.facet-axis-left'],
    ['areaspline', '.facet-axis-left'],
  ] as const)('starts a non-negative %s value axis at zero', (type, axis) => {
    const el = container();
    new FacetViz(el, {
      chart: { type, animation: false },
      xAxis: { categories: ['Low', 'High'] },
      series: [{ data: [5, 10] }],
    });

    const ticks = [...el.querySelectorAll(`${axis} text`)]
      .map((node) => Number(node.textContent))
      .filter(Number.isFinite);
    expect(Math.min(...ticks)).toBe(0);
    expect(Math.max(...ticks)).toBeGreaterThan(10);
  });

  it('starts a non-negative stacked area value axis at zero', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'area', animation: false },
      xAxis: { categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
      series: [
        { stacking: 'normal', data: [3, 4, 3, 5, 4, 6] },
        { stacking: 'normal', data: [2, 3, 4, 3, 5, 4] },
      ],
    });

    const ticks = [...el.querySelectorAll('.facet-axis-left text')]
      .map((node) => Number(node.textContent))
      .filter(Number.isFinite);
    expect(Math.min(...ticks)).toBe(0);
    expect(Math.max(...ticks)).toBeGreaterThan(10);
  });

  it('uses a clean automatic maximum when only the y-axis minimum is set', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: {
        categories: ['Science', 'History', 'Computer', 'English', 'Geography', 'Maths'],
      },
      yAxis: { min: 60 },
      series: [{
        data: [
          63.294117647058826,
          63.11363636363637,
          65.83673469387755,
          65.4375,
          64,
          61.588235294117645,
        ],
      }],
    });

    const labels = [...el.querySelectorAll('.facet-axis-left text')]
      .map((node) => node.textContent);
    expect(labels).toEqual(['60', '62', '64', '66', '68']);
  });

  it('uses document-unique clip paths when multiple charts are rendered', () => {
    const first = container();
    const second = container();
    const options = {
      chart: { type: 'column' as const, animation: false },
      xAxis: { categories: ['A', 'B'] },
      series: [{ data: [3, 5] }],
    };
    new FacetViz(first, options);
    new FacetViz(second, options);

    const firstClip = first.querySelector('clipPath')?.id;
    const secondClip = second.querySelector('clipPath')?.id;
    expect(firstClip).toBeTruthy();
    expect(secondClip).toBeTruthy();
    expect(secondClip).not.toBe(firstClip);
    expect(first.querySelector('.facet-series')?.getAttribute('clip-path'))
      .toBe(`url(#${firstClip})`);
    expect(second.querySelector('.facet-series')?.getAttribute('clip-path'))
      .toBe(`url(#${secondClip})`);
  });

  it('draws one grouped bar set per series', () => {
    const el = container();
    new FacetViz(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A', 'B'] }, series: [{ name: 'X', data: [1, 2] }, { name: 'Y', data: [3, 4] }] });
    expect(el.querySelectorAll('.facet-column .facet-point').length).toBe(4);
  });

  it.each([
    ['normal', 2, 3, 2, 5],
    ['percent', 1, 3, 25, 100],
  ] as const)('stacks radial-bar arcs using %s stacking', (stacking, firstValue, secondValue, firstHigh, secondHigh) => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'radialbar', animation: false },
      series: [
        { name: 'Base', stacking, data: [{ name: 'A', y: firstValue }] },
        { name: 'Top', stacking, data: [{ name: 'A', y: secondValue }] },
      ],
    });
    const paths = [...el.querySelectorAll<SVGPathElement>('.facet-radialbar .facet-point')];
    const track = el.querySelector<SVGPathElement>('.facet-radialbar-track');
    const outerEndpoints = (path: SVGPathElement) => {
      const tokens = path.getAttribute('d')!.split(' ');
      return {
        start: [Number(tokens[1]), Number(tokens[2])],
        end: [Number(tokens[9]), Number(tokens[10])],
      };
    };

    expect(paths).toHaveLength(2);
    expect(el.querySelectorAll('.facet-radialbar-track')).toHaveLength(1);
    expect(el.querySelectorAll('.facet-radialbar-label')).toHaveLength(1);
    expect(chart.series[0].points[0].stackLow).toBe(0);
    expect(chart.series[0].points[0].stackHigh).toBe(firstHigh);
    expect(chart.series[1].points[0].stackLow).toBe(firstHigh);
    expect(chart.series[1].points[0].stackHigh).toBe(secondHigh);
    expect(chart.legendItems.map((item) => item.label)).toEqual(['Base', 'Top']);

    const first = outerEndpoints(paths[0]);
    const second = outerEndpoints(paths[1]);
    const fullTrack = outerEndpoints(track!);
    expect(first.end[0]).toBeCloseTo(second.start[0]);
    expect(first.end[1]).toBeCloseTo(second.start[1]);
    expect(second.end[0]).toBeCloseTo(fullTrack.end[0]);
    expect(second.end[1]).toBeCloseTo(fullTrack.end[1]);
    expect(paths[0].getAttribute('fill')).not.toBe(paths[1].getAttribute('fill'));
  });

  it('matches stacked radial-bar rings by category rather than point position', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'radialbar', animation: false },
      series: [
        { stacking: 'normal', data: [{ name: 'A', y: 1 }, { name: 'B', y: 2 }] },
        { stacking: 'normal', data: [{ name: 'B', y: 3 }] },
      ],
    });
    const paths = [...el.querySelectorAll<SVGPathElement>('.facet-radialbar .facet-point')];
    const outerRadius = (path: SVGPathElement) =>
      Number(path.getAttribute('d')!.split(' ')[4]);

    expect(paths).toHaveLength(3);
    expect(outerRadius(paths[2])).toBeCloseTo(outerRadius(paths[1]));
    expect(outerRadius(paths[2])).not.toBeCloseTo(outerRadius(paths[0]));
    expect(chart.series[1].points[0].stackLow).toBe(2);
    expect(chart.series[1].points[0].stackHigh).toBe(5);
  });

  it('supports a half-circle sweep for stacked radial bars', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'radialbar', animation: false },
      plotOptions: { radialbar: { startAngle: -90, endAngle: 90 } },
      series: [
        { stacking: 'normal', data: [{ name: 'A', y: 1 }] },
        { stacking: 'normal', data: [{ name: 'A', y: 1 }] },
      ],
    });
    const paths = [...el.querySelectorAll<SVGPathElement>('.facet-radialbar .facet-point')];
    const track = el.querySelector<SVGPathElement>('.facet-radialbar-track')!;
    const trackTokens = track.getAttribute('d')!.split(' ');
    const topSegmentTokens = paths[1].getAttribute('d')!.split(' ');

    expect(track.getAttribute('d')?.match(/\bA\b/g)).toHaveLength(2);
    expect(Number(trackTokens[1])).toBeCloseTo(Number(trackTokens[9]));
    expect(Number(trackTokens[2])).toBeLessThan(Number(trackTokens[10]));
    expect(Number(topSegmentTokens[9])).toBeCloseTo(Number(trackTokens[9]));
    expect(Number(topSegmentTokens[10])).toBeCloseTo(Number(trackTokens[10]));
  });

  it('renders a complete radial-bar ring for a 360-degree sweep', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'radialbar', animation: false },
      plotOptions: { radialbar: { startAngle: -90, endAngle: 270 } },
      series: [{ data: [{ name: 'A', y: 1 }] }],
    });

    expect(el.querySelector('.facet-radialbar-track')?.getAttribute('d')?.match(/\bA\b/g))
      .toHaveLength(4);
    expect(el.querySelector('.facet-radialbar .facet-point')?.getAttribute('d')?.match(/\bA\b/g))
      .toHaveLength(4);
  });

  it.each([
    ['column', 'x', 'width'],
    ['bar', 'y', 'height'],
  ] as const)('keeps the gap between grouped %ss when columnWidth is reduced', (type, position, dimension) => {
    const groupedRects = (columnWidth?: number) => {
      const el = container();
      new FacetViz(el, {
        chart: { type, animation: false, responsive: false },
        xAxis: { categories: ['A'] },
        plotOptions: columnWidth === undefined ? undefined : { [type]: { columnWidth } },
        series: [{ data: [1] }, { data: [2] }],
      });
      return [...el.querySelectorAll<SVGRectElement>('.facet-column .facet-point')];
    };
    const gap = (rects: SVGRectElement[]) =>
      Number(rects[1].getAttribute(position)) -
      Number(rects[0].getAttribute(position)) -
      Number(rects[0].getAttribute(dimension));

    const defaultRects = groupedRects();
    const narrowRects = groupedRects(12);

    expect(Number(narrowRects[0].getAttribute(dimension))).toBe(12);
    expect(Number(narrowRects[1].getAttribute(dimension))).toBe(12);
    expect(gap(narrowRects)).toBeCloseTo(gap(defaultRects));
  });

  it('inverts the axis mapping for bar charts', () => {
    const el = container();
    new FacetViz(el, { chart: { type: 'bar', animation: false }, xAxis: { categories: ['Jan', 'Feb'] }, yAxis: { title: { text: 'Units' } }, series: [{ name: 'S', data: [5, 3] }] });
    const left = [...el.querySelectorAll('.facet-axis-left text')].map((t) => t.textContent);
    const bottom = [...el.querySelectorAll('.facet-axis-bottom text')].map((t) => t.textContent);
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
      ['treemap', [{ id: 'a', name: 'A' }, { id: 'b', parent: 'a', name: 'B', value: 3 }]],
      ['sankey', [{ from: 'A', to: 'B', weight: 5 }]],
    ];
    for (const [type, data] of types) {
      const el = container();
      expect(() => new FacetViz(el, { chart: { type, animation: false } as any, series: [{ name: 'S', data }] })).not.toThrow();
      expect(el.querySelector('svg')).toBeTruthy();
    }
  });

  it.each([
    ['a single object', [{ name: 'Only', y: 5 }]],
    ['a single value', [5]],
  ])('renders a pie with %s as a full circle', (_label, data) => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'pie', animation: false },
      series: [{ name: 'S', data }],
    });

    const path = el.querySelector('.facet-pie .facet-point');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('d')?.match(/\bA\b/g)).toHaveLength(2);
  });

  it('renders a donut with one point as a full ring', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'donut', animation: false },
      series: [{ name: 'S', data: [{ name: 'Only', y: 5 }] }],
    });

    const path = el.querySelector('.facet-pie .facet-point');
    expect(path?.getAttribute('d')?.match(/\bA\b/g)).toHaveLength(4);
  });

  it('renders every gauge value from left to right', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'gauge', animation: false },
      series: [{
        name: 'Load',
        data: [
          { name: 'API', y: 25 },
          { name: 'Workers', y: 50 },
          { name: 'Database', y: 75 },
        ],
      }],
    });

    const values = [...el.querySelectorAll<SVGTextElement>('.facet-gauge-value')];
    expect(el.querySelectorAll('.facet-gauge-item')).toHaveLength(3);
    expect(el.querySelectorAll('.facet-gauge .facet-point')).toHaveLength(3);
    expect(values.map((node) => node.textContent)).toEqual(['25', '50', '75']);
    const xPositions = values.map((node) => Number(node.getAttribute('x')));
    expect(xPositions[0]).toBeLessThan(xPositions[1]);
    expect(xPositions[1]).toBeLessThan(xPositions[2]);
    expect(new Set(values.map((node) => node.getAttribute('y'))).size).toBe(1);
  });

  it('renders every gauge value from top to bottom when inverted', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'gauge', inverted: true, animation: false },
      series: [{ data: [20, 40, 60] }],
    });

    const values = [...el.querySelectorAll<SVGTextElement>('.facet-gauge-value')];
    expect(values).toHaveLength(3);
    expect(new Set(values.map((node) => node.getAttribute('x'))).size).toBe(1);
    const yPositions = values.map((node) => Number(node.getAttribute('y')));
    expect(yPositions[0]).toBeLessThan(yPositions[1]);
    expect(yPositions[1]).toBeLessThan(yPositions[2]);
  });

  it('renders a full-circle gauge from startAngle and endAngle', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'gauge', animation: false },
      series: [{
        name: 'Utilization',
        min: 0,
        max: 100,
        minLabel: 'Min',
        maxLabel: 'Max',
        startAngle: -90,
        endAngle: 270,
        data: [{ name: 'API', y: 82 }],
      }],
    });

    const paths = el.querySelectorAll<SVGPathElement>('.facet-gauge-item path');
    // The track is split into two outer and two inner arcs so SVG can render
    // the otherwise coincident endpoints of a 360° ring.
    expect(paths[0].getAttribute('d')?.match(/\bA\b/g)).toHaveLength(4);
    expect(el.querySelector('.facet-gauge-value')?.textContent).toBe('82');
    const min = [...el.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Min');
    const max = [...el.querySelectorAll<SVGTextElement>('text')]
      .find((node) => node.textContent === 'Max');
    expect(min?.getAttribute('x')).not.toBe(max?.getAttribute('x'));
  });

  it('can independently hide gauge min and max labels', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'gauge', animation: false },
      series: [{
        minLabel: 'Minimum',
        maxLabel: 'Maximum',
        showMinLabel: false,
        data: [50],
      }],
    });

    const labels = [...el.querySelectorAll<SVGTextElement>('text')]
      .map((node) => node.textContent);
    expect(labels).not.toContain('Minimum');
    expect(labels).toContain('Maximum');
  });

  it('can render gauge track and value bands with rounded ends', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'gauge', animation: false },
      series: [{ roundedEnds: true, data: [50] }],
    });

    expect(el.querySelectorAll('.facet-gauge-track-cap')).toHaveLength(2);
    expect(el.querySelectorAll('.facet-gauge-value-cap')).toHaveLength(2);
  });

  it('sizes the gauge band in pixels or as a percentage of the radius', () => {
    const band = (thickness: number | string) => {
      const el = container();
      new FacetViz(el, {
        chart: { type: 'gauge', animation: false },
        series: [{ thickness, min: 0, max: 100, data: [100] }],
      });
      // A full band runs from the left end of the dial to the right: its outer
      // arc ends at x = cx + r, and its inner edge starts the band's width in.
      const d = el.querySelectorAll<SVGPathElement>('.facet-gauge-item path')[1].getAttribute('d')!;
      const nums = /^M ([\d.-]+) [\d.-]+ A [^ ]+ [^ ]+ 0 \d 1 ([\d.-]+) [\d.-]+ L ([\d.-]+)/.exec(d)!.map(Number);
      const [, left, right, inner] = nums;
      return { width: right - inner, radius: (right - left) / 2 };
    };
    expect(band(12).width).toBeCloseTo(12, 5);
    const quarter = band('25%');
    expect(quarter.width).toBeCloseTo(quarter.radius / 4, 5);
    // Past 80% of the radius the band is capped, as for pixels.
    const thick = band('95%');
    expect(thick.width).toBeCloseTo(thick.radius * 0.8, 5);
  });

  it('positions gauge names at the requested item edge or centre', () => {
    const renderNameY = (namePosition: 'top' | 'center' | 'bottom') => {
      const el = container();
      new FacetViz(el, {
        chart: { type: 'gauge', animation: false },
        series: [{ namePosition, data: [{ name: 'API', y: 50 }] }],
      });
      return Number(el.querySelector<SVGTextElement>('.facet-gauge-label')?.getAttribute('y'));
    };

    const top = renderNameY('top');
    const center = renderNameY('center');
    const bottom = renderNameY('bottom');
    expect(top).toBeLessThan(center);
    expect(center).toBeLessThan(bottom);
  });

  it('centres a gauge value when its name is at the top or bottom', () => {
    const renderValueY = (namePosition: 'top' | 'center' | 'bottom') => {
      const el = container();
      new FacetViz(el, {
        chart: { type: 'gauge', animation: false },
        series: [{ namePosition, data: [{ name: 'API', y: 50 }] }],
      });
      return Number(el.querySelector<SVGTextElement>('.facet-gauge-value')?.getAttribute('y'));
    };

    const top = renderValueY('top');
    const center = renderValueY('center');
    const bottom = renderValueY('bottom');
    expect(top).toBe(bottom);
    expect(top).toBeGreaterThan(center);
  });

  it('shows the hovered donut slice value in the hollow centre', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'donut', animation: false },
      series: [{
        name: 'S',
        tooltip: { valuePrefix: '$', valueSuffix: 'm', valueDecimals: 1 },
        data: [{ name: 'A', y: 3 }, { name: 'B', y: 5 }],
      }],
    });

    const slices = el.querySelectorAll<SVGPathElement>('.facet-pie .facet-point');
    const center = el.querySelector<SVGTextElement>('.facet-donut-center-value');
    expect(center?.textContent).toBe('');

    slices[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(center?.textContent).toBe('$5.0m');

    slices[1].dispatchEvent(new MouseEvent('mouseleave'));
    expect(center?.textContent).toBe('');

    slices[0].dispatchEvent(new FocusEvent('focus'));
    expect(center?.textContent).toBe('$3.0m');

    slices[0].dispatchEvent(new FocusEvent('blur'));
    expect(center?.textContent).toBe('');
  });

  it('does not add a centre value readout to a pie without a hole', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'pie', animation: false },
      series: [{ name: 'S', data: [{ name: 'A', y: 3 }] }],
    });

    expect(el.querySelector('.facet-donut-center-value')).toBeNull();
  });

  it('configures the donut centre label formatting and style', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'donut', animation: false },
      series: [{
        name: 'Revenue',
        centerLabel: {
          format: '{name}: {y:,.1f}',
          color: '#123456',
          fontSize: '18px',
          fontWeight: '700',
          fontFamily: 'serif',
        },
        data: [{ name: 'Direct', y: 1234.5 }],
      }],
    });

    const slice = el.querySelector<SVGPathElement>('.facet-pie .facet-point')!;
    const center = el.querySelector<SVGTextElement>('.facet-donut-center-value')!;
    expect(center.getAttribute('fill')).toBe('#123456');
    expect(center.getAttribute('font-size')).toBe('18px');
    expect(center.getAttribute('font-weight')).toBe('700');
    expect(center.getAttribute('font-family')).toBe('serif');

    slice.dispatchEvent(new MouseEvent('mouseenter'));
    expect(center.textContent).toBe('Direct: 1,234.5');
  });

  it('can disable the donut centre label', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'donut', animation: false },
      series: [{
        name: 'S',
        centerLabel: { enabled: false },
        data: [{ name: 'A', y: 3 }],
      }],
    });

    expect(el.querySelector('.facet-donut-center-value')).toBeNull();
  });

  it('renders a large (boost-triggering) scatter without throwing', () => {
    const el = container();
    const data = Array.from({ length: 3000 }, (_, i) => [i, Math.sin(i / 20)]);
    expect(() => new FacetViz(el, { chart: { type: 'scatter', animation: false }, series: [{ name: 'S', data }] })).not.toThrow();
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('toggles series visibility and exports SVG', () => {
    const el = container();
    const chart = new FacetViz(el, { chart: { type: 'column', animation: false }, xAxis: { categories: ['A'] }, series: [{ name: 'S', data: [3] }] });
    const svg = chart.getSVG();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns');
    chart.setData(0, [7]);
    expect(el.querySelectorAll('.facet-column .facet-point').length).toBe(1);
  });

  it('can omit an individual series from the legend', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A'] },
      series: [
        { name: 'Visible in legend', data: [3] },
        { name: 'Hidden from legend', data: [5], showInLegend: false },
        { name: 'Also visible in legend', data: [7] },
      ],
    });

    expect(chart.legendItems.map((item) => item.label)).toEqual([
      'Visible in legend',
      'Also visible in legend',
    ]);

    el.querySelectorAll('.facet-legend-item')[1].dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(chart.series[0].visible).toBe(true);
    expect(chart.series[1].visible).toBe(true);
    expect(chart.series[2].visible).toBe(false);
  });

  it('lists series under their legend group headings', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A'] },
      series: [
        { name: 'East', data: [3], legendGroup: 'Revenue' },
        { name: 'West', data: [4], legendGroup: 'Revenue' },
        { name: 'East', data: [5], legendGroup: 'Profit' },
        { name: 'Total', data: [6] },
      ],
    });

    expect(chart.legendItems.map((item) => item.label)).toEqual(['Revenue', 'East', 'West', 'Profit', 'East', 'Total']);
    const headings = [...el.querySelectorAll('.facet-legend-heading text')].map((t) => t.textContent);
    expect(headings).toEqual(['Revenue', 'Profit']);
    // Items keep toggling their own series; headings toggle nothing.
    el.querySelectorAll('.facet-legend-item')[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chart.series.map((s) => s.visible)).toEqual([true, true, false, true]);
  });

  it('shares one legend item between series with the same legend key', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A'] },
      series: [
        { name: 'East · Q1', data: [3], legendKey: 'east', legendLabel: 'East' },
        { name: 'West', data: [4], legendKey: 'west' },
        { name: 'East · Q2', data: [5], legendKey: 'east', legendLabel: 'East' },
        { name: 'Total', data: [6] },
      ],
    });

    expect(chart.legendItems.map((item) => item.label)).toEqual(['East', 'West', 'Total']);
    // The shared item shows and hides every series with its key.
    el.querySelectorAll('.facet-legend-item')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chart.series.map((s) => s.visible)).toEqual([false, true, false, true]);
    el.querySelectorAll('.facet-legend-item')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chart.series.map((s) => s.visible)).toEqual([true, true, true, true]);
  });

  it('gives tooltip formatters the series index and options', () => {
    const el = container();
    const seen: unknown[] = [];
    new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A'] },
      tooltip: {
        shared: true,
        formatter: (ctx) => {
          seen.push([ctx.seriesIndex, ctx.seriesOptions?.name, ...(ctx.points ?? []).map((p) => p.seriesIndex)]);
          return '';
        },
      },
      series: [
        { name: 'East', data: [3] },
        { name: 'East', data: [4] },
      ],
    });
    el.querySelectorAll('.facet-point')[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(seen).toEqual([[1, 'East', 0, 1]]);
  });

  it('draws a colour scale for a run of series and toggles them together', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A'] },
      legend: {
        colorScales: [{ label: 'Quantity', min: '1', max: '3', colors: ['#ccddff', '#3366cc'], series: [0, 1] }],
      },
      series: [
        { name: '1', data: [3], color: '#ccddff', showInLegend: false },
        { name: '3', data: [5], color: '#3366cc', showInLegend: false },
        { name: 'Total', data: [8] },
      ],
    });

    expect(chart.hasLegend).toBe(true);
    expect(chart.legendItems.map((item) => item.label)).toEqual(['Quantity', 'Total']);
    const scale = el.querySelector('.facet-legend-scale')!;
    expect([...scale.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['Quantity', '1', '3']);
    expect([...scale.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color'))).toEqual(['#ccddff', '#3366cc']);

    scale.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chart.series.map((s) => s.visible)).toEqual([false, false, true]);
    el.querySelector('.facet-legend-scale')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chart.series.map((s) => s.visible)).toEqual([true, true, true]);
  });

  it('draws a colour key whose swatches toggle nothing', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A', 'B'] },
      legend: { colorKeys: [{ label: 'Size', items: [{ label: 'High', color: '#aa0000' }, { label: 'Low', color: '#0000aa' }] }] },
      series: [{ name: 'Sales', data: [{ y: 3, color: '#aa0000' }, { y: 1, color: '#0000aa' }], showInLegend: false }],
    });
    expect(chart.hasLegend).toBe(true);
    expect(chart.legendItems.map((item) => [item.label, item.heading ?? false, item.key ?? false])).toEqual([
      ['Size', true, false],
      ['High', false, true],
      ['Low', false, true],
    ]);
    const swatch = [...el.querySelectorAll('.facet-legend-item')].find((n) => n.textContent === 'High')!;
    swatch.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chart.series.map((s) => s.visible)).toEqual([true]);
  });

  it('shows a legend for a lone colour scale', () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: { type: 'column', animation: false },
      xAxis: { categories: ['A'] },
      legend: { colorScales: [{ min: 'low', max: 'high', colors: ['#eee', '#333'], series: [0] }] },
      series: [{ name: 'Only', data: [3], showInLegend: false }],
    });
    expect(chart.hasLegend).toBe(true);
    expect(el.querySelectorAll('.facet-legend-scale').length).toBe(1);
  });

  it('applies itemStyle attributes to legend text', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', animation: false, scaleFonts: false },
      legend: {
        itemStyle: {
          'font-size': '20px',
          'font-weight': '700',
          fill: '#123456',
        },
      },
      series: [
        { name: 'First', data: [3] },
        { name: 'Second', data: [5] },
      ],
    });

    const label = el.querySelector<SVGTextElement>('.facet-legend-item text');
    expect(label?.getAttribute('font-size')).toBe('20px');
    expect(label?.getAttribute('font-weight')).toBe('700');
    expect(label?.getAttribute('fill')).toBe('#123456');
  });

  it('wraps and spaces legend items according to their font size', () => {
    const el = container();
    new FacetViz(el, {
      chart: { type: 'column', width: 320, height: 360, animation: false },
      legend: { itemStyle: { 'font-size': '24px' } },
      series: [
        { name: 'Alpha label', data: [1] },
        { name: 'Bravo label', data: [2] },
        { name: 'Charlie label', data: [3] },
      ],
    });

    const labels = [
      ...el.querySelectorAll<SVGTextElement>('.facet-legend-item text'),
    ];
    const labelYs = labels.map((label) => Number(label.getAttribute('y')));
    expect(new Set(labelYs).size).toBe(3);
    expect(labelYs[1] - labelYs[0]).toBeGreaterThanOrEqual(24);
    expect(labelYs[2] - labelYs[1]).toBeGreaterThanOrEqual(24);

    const firstLegendY = labelYs[0];
    const plotBottom = Math.max(
      ...[...el.querySelectorAll<SVGRectElement>('.facet-column .facet-point')]
        .map((point) =>
          Number(point.getAttribute('y')) + Number(point.getAttribute('height')),
        ),
    );
    expect(plotBottom).toBeLessThan(firstLegendY);
  });
});
