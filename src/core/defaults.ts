/** Default option values, deep-merged under user options. */

import type { ChartOptions } from './options.js';

export const DEFAULT_OPTIONS: Partial<ChartOptions> = {
  chart: {
    type: 'line',
    spacing: [16, 16, 16, 16],
    inverted: false,
    polar: false,
    // `backgroundColor`, `colors`, `width`, and `height` are intentionally
    // left unset so the theme (and the container's actual size) can supply
    // them — the constructor falls back to clientWidth/clientHeight, then a
    // hardcoded 640×400, only once it sees these are genuinely unset.
    // Explicit user values still win via the normal merge.
  },
  title: { text: undefined, align: 'center' },
  subtitle: { text: undefined, align: 'center' },
  tooltip: {
    enabled: true,
    shared: false,
    // Colours come from the theme unless the user overrides them.
  },
  legend: {
    enabled: true,
    align: 'center',
    verticalAlign: 'bottom',
  },
};

/** Layout constants shared by the chart and axes. */
export const LAYOUT = {
  titleHeight: 30,
  subtitleHeight: 20,
  legendHeight: 34,
  axisLabelGap: 8,
  axisTitleGap: 28,
  tickLength: 5,
  defaultLeftAxisWidth: 44,
  defaultBottomAxisHeight: 34,
};

/**
 * Text style tokens. Values are mutated by the theme layer (`applyTheme`) at
 * render time, so entries are typed loosely to allow extra keys like
 * `font-family`.
 */
export const FONTS: Record<string, Record<string, string>> = {
  title: { 'font-size': '18px', 'font-weight': '600', fill: '#333333' },
  subtitle: { 'font-size': '13px', fill: '#666666' },
  axisLabel: { 'font-size': '11px', fill: '#666666' },
  axisTitle: { 'font-size': '12px', fill: '#444444' },
  legend: { 'font-size': '12px', fill: '#333333' },
  dataLabel: { 'font-size': '11px', fill: '#333333' },
};
