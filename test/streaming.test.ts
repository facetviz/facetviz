import { beforeEach, describe, expect, it } from 'vitest';
import { ChartValidationError, FacetViz, type PointInput } from '../src/index.js';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('streaming and batched updates', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('appends batches into a bounded rolling source window', () => {
    const chart = new FacetViz(container(), {
      chart: { type: 'line', animation: false },
      series: [{ data: [1, 2, 3] }],
    });
    const incoming: PointInput[] = [4, 5, 6];
    chart.appendData(0, incoming, { maxPoints: 4 });

    expect(chart.series[0].points.map((point) => point.y)).toEqual([3, 4, 5, 6]);
    expect(incoming).toEqual([4, 5, 6]);
    expect(() => chart.appendData(0, [7], { maxPoints: 0 })).toThrow(RangeError);
  });

  it('renders exactly once for an outer batch', () => {
    const chart = new FacetViz(container(), {
      chart: { type: 'line', animation: false },
      series: [{ data: [1] }],
    });
    let renders = 0;
    chart.on('render', () => { renders += 1; });

    chart.batchUpdate((batch) => {
      batch.appendData(0, [2]);
      batch.appendData(0, [3]);
      batch.update({ title: { text: 'Batched' } });
    });

    expect(renders).toBe(1);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2, 3]);
    expect(chart.options.title?.text).toBe('Batched');
  });

  it('supports nested batches and rolls back only a failed nested level', () => {
    const chart = new FacetViz(container(), {
      chart: { type: 'line', animation: false },
      series: [{ data: [1] }],
    });
    let renders = 0;
    chart.on('render', () => { renders += 1; });

    chart.batchUpdate((outer) => {
      outer.appendData(0, [2]);
      try {
        outer.batchUpdate((inner) => {
          inner.appendData(0, [99]);
          throw new Error('cancel nested changes');
        });
      } catch {
        // The outer transaction can continue after the inner checkpoint rolls back.
      }
      outer.appendData(0, [3]);
    });

    expect(renders).toBe(1);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2, 3]);
  });

  it('rolls back source options and skips rendering when a batch throws', () => {
    const chart = new FacetViz(container(), {
      chart: { type: 'line', animation: false },
      series: [{ data: [1, 2] }],
    });
    let renders = 0;
    chart.on('render', () => { renders += 1; });

    expect(() => chart.batchUpdate((batch) => {
      batch.appendData(0, [3]);
      batch.update({ title: { text: 'Never committed' } });
      throw new Error('cancel');
    })).toThrow('cancel');

    expect(renders).toBe(0);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2]);
    expect(chart.options.title?.text).not.toBe('Never committed');
    chart.appendData(0, [4]);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2, 4]);
  });

  it('validates the final batch atomically and restores invalid changes', () => {
    const chart = new FacetViz(container(), {
      validation: { mode: 'error' },
      chart: { type: 'line', animation: false },
      yAxis: { type: 'log' },
      series: [{ data: [1, 2] }],
    });

    expect(() => chart.batchUpdate((batch) => {
      batch.appendData(0, [3]);
      batch.appendData(0, [0]);
    })).toThrow(ChartValidationError);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2]);

    chart.appendData(0, [4]);
    expect(chart.series[0].points.map((point) => point.y)).toEqual([1, 2, 4]);
  });

  it('preserves runtime visibility and zoom ranges during streaming', () => {
    const chart = new FacetViz(container(), {
      chart: { type: 'line', animation: false, zoom: 'xy' },
      series: [{ name: 'A', data: [[0, 1], [1, 2]] }],
    });
    chart.series[0].visible = false;
    chart.options.xAxis = { min: 0.25, max: 0.75 };

    chart.appendData(0, [[2, 3]]);
    const streamedAxis = Array.isArray(chart.options.xAxis) ? chart.options.xAxis[0] : chart.options.xAxis!;
    expect(chart.series[0].visible).toBe(false);
    expect([streamedAxis.min, streamedAxis.max]).toEqual([0.25, 0.75]);

    chart.update({ xAxis: { min: 0, max: 2 } });
    const updatedAxis = Array.isArray(chart.options.xAxis) ? chart.options.xAxis[0] : chart.options.xAxis!;
    expect([updatedAxis.min, updatedAxis.max]).toEqual([0, 2]);
  });

  it('rejects asynchronous batch callbacks', () => {
    const chart = new FacetViz(container(), { series: [{ data: [1] }] });
    expect(() => chart.batchUpdate((async () => {}) as never)).toThrow(/synchronous/);
  });
});
