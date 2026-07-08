/** Default option values, deep-merged under user options. */

import type { ChartOptions } from './options.js';
import { DEFAULT_COLORS } from './colors.js';

export const DEFAULT_OPTIONS: Partial<ChartOptions> = {
  chart: {
    type: 'line',
    width: 640,
    height: 400,
    backgroundColor: '#ffffff',
    spacing: [16, 16, 16, 16],
    inverted: false,
    polar: false,
    colors: DEFAULT_COLORS,
  },
  title: { text: undefined, align: 'center' },
  subtitle: { text: undefined, align: 'center' },
  tooltip: {
    enabled: true,
    shared: false,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#cccccc',
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

export const FONTS = {
  title: { 'font-size': '18px', 'font-weight': '600', fill: '#333333' },
  subtitle: { 'font-size': '13px', fill: '#666666' },
  axisLabel: { 'font-size': '11px', fill: '#666666' },
  axisTitle: { 'font-size': '12px', fill: '#444444' },
  legend: { 'font-size': '12px', fill: '#333333' },
  dataLabel: { 'font-size': '11px', fill: '#333333' },
};
