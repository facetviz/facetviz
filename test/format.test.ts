import { describe, it, expect } from 'vitest';
import { formatValue, formatString, formatDate, abbreviateNumber, groupThousands, niceTicks, niceDateTicks, decimateLine } from '../src/core/utils.js';

describe('formatValue', () => {
  it('fixed + thousands', () => {
    expect(formatValue(1234.5, ',.0f')).toBe('1,235');
    expect(formatValue(1234.567, ',.2f')).toBe('1,234.57');
    expect(formatValue(-9999.9, ',.1f')).toBe('-9,999.9');
  });
  it('percent', () => expect(formatValue(0.1234, '.1%')).toBe('12.3%'));
  it('currency prefix', () => expect(formatValue(1234567, '$,.2f')).toBe('$1,234,567.00'));
  it('SI abbreviation', () => {
    expect(formatValue(1234567, '.2s')).toBe('1.23M');
    expect(formatValue(5300, '.1s')).toBe('5.3k');
  });
  it('integer', () => expect(formatValue(42.7, 'd')).toBe('43'));
});

describe('formatString', () => {
  it('tokens + specs', () => {
    expect(formatString('{name}: {y:,.1f} ({percentage:.0f}%)', { name: 'North', y: 12345.6, percentage: 63.4 }))
      .toBe('North: 12,345.6 (63%)');
  });
  it('dotted paths', () => expect(formatString('Total {point.total:$,.0f}', { point: { total: 98765 } })).toBe('Total $98,765'));
  it('date token', () => expect(formatString('{x:%b %Y}', { x: Date.UTC(2026, 0, 15) })).toBe('Jan 2026'));
  it('missing → empty', () => expect(formatString('{nope}', {})).toBe(''));
});

describe('helpers', () => {
  it('abbreviateNumber', () => expect(abbreviateNumber(2.5e9)).toBe('2.5B'));
  it('groupThousands', () => expect(groupThousands('1234567.89')).toBe('1,234,567.89'));
  it('formatDate', () => expect(formatDate(new Date(2026, 6, 9), '%Y-%m-%d')).toBe('2026-07-09'));
});

describe('ticks', () => {
  it('niceTicks covers the range', () => {
    const t = niceTicks(0, 97, 6);
    expect(t[0]).toBeLessThanOrEqual(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(97);
  });
  it('niceDateTicks picks a day format over ~2 weeks', () => {
    const { ticks, format } = niceDateTicks(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 15));
    expect(format).toBe('%b %d');
    expect(ticks.length).toBeGreaterThan(1);
  });
});

describe('decimateLine (boost)', () => {
  it('drastically reduces dense lines while keeping the extremes', () => {
    const pts = Array.from({ length: 20000 }, (_, i) => ({ x: i * 0.02, y: Math.sin(i / 50) * 100 }));
    const out = decimateLine(pts);
    expect(out.length).toBeLessThan(pts.length / 5);
    const yMax = Math.max(...out.map((p) => p.y));
    expect(yMax).toBeGreaterThan(95); // peaks survive
  });
  it('leaves small series untouched', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i }));
    expect(decimateLine(pts).length).toBe(100);
  });
});
