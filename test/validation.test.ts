import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseSeries,
  ChartValidationError,
  FacetViz,
  isSeriesTypeRegistered,
  registerSeriesType,
  validateChartOptions,
  type SeriesCapabilities,
  type SeriesRenderContext,
} from '../src/index.js';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

const codes = (value: unknown): string[] =>
  validateChartOptions(value).issues.map((issue) => issue.code);

describe('configuration validation', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('accepts a valid mixed-series configuration', () => {
    const result = validateChartOptions({
      chart: { type: 'column', width: 640, height: 400 },
      xAxis: { categories: ['A', 'B'] },
      yAxis: [{}, { opposite: true }],
      series: [
        { name: 'Bars', data: [2, 4] },
        { type: 'line', name: 'Trend', yAxis: 1, data: [3, 5] },
      ],
    });
    expect(result).toEqual({ valid: true, errors: [], warnings: [], issues: [] });
  });

  it('reports structural problems with stable codes and paths', () => {
    const result = validateChartOptions({
      chart: { type: 'not-a-chart', width: -10 },
      colors: [],
      validation: { mode: 'broken', onIssue: 'not-a-function' },
      xAxis: { type: 'ordinal' },
      series: [{ type: 'also-unknown' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'chart.type.unknown', path: 'chart.type' }),
      expect.objectContaining({ code: 'chart.width.positive', path: 'chart.width' }),
      expect.objectContaining({ code: 'colors.non_empty', path: 'colors' }),
      expect.objectContaining({ code: 'validation.mode', path: 'validation.mode' }),
      expect.objectContaining({ code: 'axis.type.unknown', path: 'xAxis.type' }),
      expect.objectContaining({ code: 'series.type.unknown', path: 'series[0].type' }),
    ]));
    expect(codes(null)).toContain('config.object');
    expect(codes({})).toContain('series.required');
  });

  it('returns issues instead of throwing for hostile unknown values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => validateChartOptions({
      chart: { type: circular },
      colors: [Symbol('color')],
      xAxis: [Symbol('axis')],
      series: [{ type: Symbol('series'), data: [] }],
    })).not.toThrow();
    expect(codes({
      chart: { type: 'histogram' },
      series: [{ bins: Symbol('bins'), data: [1] }],
    })).toContain('histogram.bins.positive_integer');
  });

  it('validates axes, histogram bins, logarithmic data, and ranges', () => {
    const result = validateChartOptions({
      chart: { type: 'line' },
      yAxis: { type: 'log', min: 10, max: 1 },
      series: [
        { data: [1, 0, -2] },
        { type: 'histogram', bins: 0, data: [1, 2, 3] },
        { type: 'columnrange', data: [['A', 8, 3], ['B', 2]] },
      ],
    });
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'axis.range.order',
      'axis.log.non_positive',
      'histogram.bins.positive_integer',
      'range.order',
      'range.low_high.required',
    ]));
  });

  it('validates specialised statistical, financial, gantt, and gauge data', () => {
    const result = validateChartOptions({
      series: [
        { type: 'boxplot', data: [{ min: 1, q1: 5, median: 4, q3: 7, max: 8 }] },
        { type: 'candlestick', data: [{ open: 10, high: 9, low: 8, close: 11 }] },
        { type: 'gantt', data: [{ name: 'Build', start: 10, end: 5 }] },
        { type: 'gauge', min: 100, max: 0, data: [{ y: 150 }] },
      ],
    });
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'boxplot.order', 'candlestick.order', 'gantt.range.order', 'gauge.range.order',
    ]));
    expect(result.warnings.map((issue) => issue.code)).toContain('gauge.value.outside_range');
  });

  it('detects invalid and cyclic Sankey links', () => {
    const result = validateChartOptions({
      chart: { type: 'sankey' },
      series: [{ data: [
        { from: 'A', to: 'B', weight: 2 },
        { from: 'B', to: 'A', weight: 1 },
        { from: 'C', to: '', weight: 0 },
      ] }],
    });
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'sankey.cycle', 'sankey.link.required',
    ]));
  });

  it('warns about missing hierarchy parents and drilldown references', () => {
    const result = validateChartOptions({
      chart: { type: 'treegraph' },
      drilldown: { series: [{ id: 'known', data: [1] }] },
      series: [{ data: [
        { id: 'root', name: 'Root' },
        { id: 'child', parent: 'missing', name: 'Child', drilldown: 'unknown' },
      ] }],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'hierarchy.parent.missing', 'drilldown.reference.missing',
    ]));
  });

  it('recognises runtime-registered custom series', () => {
    class CustomSeries extends BaseSeries {
      override capabilities(): SeriesCapabilities {
        return { grouped: false, cartesian: false, stackable: false };
      }
      override render(_ctx: SeriesRenderContext): void {}
    }
    registerSeriesType('custom-validation-test', CustomSeries);
    expect(isSeriesTypeRegistered('custom-validation-test')).toBe(true);
    expect(validateChartOptions({
      chart: { type: 'custom-validation-test' },
      series: [{ data: [1] }],
    }).valid).toBe(true);
  });

  it('supports warn mode and structured issue callbacks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onIssue = vi.fn();
    expect(() => new FacetViz(container(), {
      validation: { mode: 'warn', onIssue },
      series: [{ name: 'Empty', data: [] }],
    })).not.toThrow();
    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({
      code: 'series.data.empty', severity: 'warning', path: 'series[0].data',
    }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[FacetViz:series.data.empty]'));
    warn.mockRestore();
  });

  it('error mode rejects invalid construction and updates before mutation', () => {
    expect(() => new FacetViz(container(), {
      validation: { mode: 'error' },
      chart: { type: 'histogram' },
      series: [{ bins: 0, data: [1, 2] }],
    })).toThrow(ChartValidationError);

    const el = container();
    const chart = new FacetViz(el, {
      validation: { mode: 'error' },
      chart: { type: 'column', width: 600 },
      series: [{ data: [1, 2] }],
    });
    expect(() => chart.update({ chart: { type: 'unknown' } as never }))
      .toThrow(ChartValidationError);
    expect(chart.options.chart?.type).toBe('column');
    expect(() => chart.setSize(-1, 400)).toThrow(ChartValidationError);
    expect(el.querySelector('svg')?.getAttribute('width')).toBe('600');
  });

  it('validates setData before replacing existing data', () => {
    const chart = new FacetViz(container(), {
      validation: { mode: 'error' },
      yAxis: { type: 'log' },
      series: [{ data: [1, 2, 3] }],
    });
    expect(() => chart.setData(0, [1, 0, 3])).toThrow(ChartValidationError);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2, 3]);
  });
});
