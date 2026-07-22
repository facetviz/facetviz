import { beforeEach, describe, expect, it, vi } from 'vitest';

function container(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe.sequential('modular entrypoints', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('core starts renderer-free and a family import registers only its aliases', async () => {
    const core = await import('../src/core.js');
    expect(core.isSeriesTypeRegistered('line')).toBe(false);
    expect(core.isSeriesTypeRegistered('column')).toBe(false);
    expect(() => new core.FacetViz(container(), {
      chart: { type: 'line', animation: false },
      series: [{ data: [1, 2, 3] }],
    })).toThrow(/facetviz\/series/);

    await import('../src/entries/series/line.js');
    expect(core.isSeriesTypeRegistered('line')).toBe(true);
    expect(core.isSeriesTypeRegistered('spline')).toBe(true);
    expect(core.isSeriesTypeRegistered('step')).toBe(true);
    expect(core.isSeriesTypeRegistered('column')).toBe(false);
    expect(() => new core.FacetViz(container(), {
      chart: { type: 'line', animation: false },
      series: [{ data: [1, 2, 3] }],
    })).not.toThrow();
  });

  it('the default entrypoint remains backward-compatible and registers all types', async () => {
    const full = await import('../src/index.js');
    for (const type of ['line', 'column', 'pie', 'sankey', 'gantt', 'sparkline'])
      expect(full.isSeriesTypeRegistered(type)).toBe(true);
  });
});
