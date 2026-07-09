/**
 * Theming. A {@link Theme} is a flat bundle of the visual tokens the chart uses
 * — palette, background, fonts and the colours of every chrome element (axes,
 * grid, legend, tooltip, labels).
 *
 * Users select a built-in theme by name (`theme: 'dark'`) or pass their own
 * partial object, optionally extending a built-in via `base`:
 *
 *   theme: { base: 'dark', colors: ['#f00', '#0f0'], axis: { gridLineColor: '#333' } }
 *
 * The resolved theme is applied to the shared FONTS object and the module-level
 * `THEME` (read by the axis/legend/tooltip renderers) at the start of each
 * render — safe because rendering is synchronous per chart.
 */

import { FONTS } from './defaults.js';
import { DEFAULT_COLORS } from './colors.js';
import { merge } from './utils.js';

export interface Theme {
  name: string;
  /** Categorical series palette. */
  colors: string[];
  backgroundColor: string;
  fontFamily: string;
  title: { color: string; fontSize: string; fontWeight: string };
  subtitle: { color: string; fontSize: string };
  axis: { labelColor: string; titleColor: string; lineColor: string; gridLineColor: string };
  dataLabel: { color: string };
  legend: { color: string; hiddenColor: string };
  tooltip: { backgroundColor: string; borderColor: string; color: string };
  /** Muted colour for connectors / neutral marks (e.g. dumbbell lines). */
  neutralColor: string;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type ThemeInput = string | (DeepPartial<Theme> & { base?: string });

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const LIGHT_THEME: Theme = {
  name: 'light',
  colors: DEFAULT_COLORS,
  backgroundColor: '#ffffff',
  fontFamily: FONT_STACK,
  title: { color: '#333333', fontSize: '18px', fontWeight: '600' },
  subtitle: { color: '#666666', fontSize: '13px' },
  axis: { labelColor: '#666666', titleColor: '#444444', lineColor: '#ccd6eb', gridLineColor: '#e6e6e6' },
  dataLabel: { color: '#333333' },
  legend: { color: '#333333', hiddenColor: '#999999' },
  tooltip: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#cccccc', color: '#333333' },
  neutralColor: '#b0b0b0',
};

const DARK_THEME: Theme = {
  name: 'dark',
  colors: ['#2caffe', '#00e272', '#fe6a35', '#d568fb', '#feb56a', '#2ee0ca', '#8a7bff', '#fa4b6b', '#91e8e1', '#a6c1ff'],
  backgroundColor: '#1e1e2e',
  fontFamily: FONT_STACK,
  title: { color: '#f5f5fa', fontSize: '18px', fontWeight: '600' },
  subtitle: { color: '#a6a6bd', fontSize: '13px' },
  axis: { labelColor: '#a6a6bd', titleColor: '#c8c8dc', lineColor: '#40405a', gridLineColor: '#2c2c40' },
  dataLabel: { color: '#e8e8f2' },
  legend: { color: '#d5d5e5', hiddenColor: '#5a5a70' },
  tooltip: { backgroundColor: 'rgba(38,38,54,0.96)', borderColor: '#4a4a64', color: '#f0f0f8' },
  neutralColor: '#5a5a72',
};

const HIGH_CONTRAST_THEME: Theme = {
  name: 'high-contrast',
  colors: ['#0050ef', '#e3170a', '#00a300', '#a700d8', '#ff8c00', '#008a8a', '#c8006e', '#5a3d00'],
  backgroundColor: '#ffffff',
  fontFamily: FONT_STACK,
  title: { color: '#000000', fontSize: '18px', fontWeight: '700' },
  subtitle: { color: '#222222', fontSize: '13px' },
  axis: { labelColor: '#000000', titleColor: '#000000', lineColor: '#000000', gridLineColor: '#bbbbbb' },
  dataLabel: { color: '#000000' },
  legend: { color: '#000000', hiddenColor: '#888888' },
  tooltip: { backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' },
  neutralColor: '#555555',
};

const PASTEL_THEME: Theme = {
  name: 'pastel',
  colors: ['#8ecae6', '#ffb5a7', '#b7e4c7', '#ffd6a5', '#cdb4db', '#a2d2ff', '#fde4cf', '#bde0fe'],
  backgroundColor: '#fbfbfd',
  fontFamily: FONT_STACK,
  title: { color: '#4a4a5a', fontSize: '18px', fontWeight: '600' },
  subtitle: { color: '#8a8a9a', fontSize: '13px' },
  axis: { labelColor: '#8a8a9a', titleColor: '#6a6a7a', lineColor: '#dfe3ec', gridLineColor: '#eef0f5' },
  dataLabel: { color: '#5a5a6a' },
  legend: { color: '#5a5a6a', hiddenColor: '#b5b5c5' },
  tooltip: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#dfe3ec', color: '#4a4a5a' },
  neutralColor: '#c7ccd6',
};

const THEMES: Record<string, Theme> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  'high-contrast': HIGH_CONTRAST_THEME,
  pastel: PASTEL_THEME,
};

/** Register (or replace) a named theme at runtime. */
export function registerTheme(name: string, theme: Theme): void {
  THEMES[name] = { ...theme, name };
}

/** Resolve a theme name or partial object into a full {@link Theme}. */
export function resolveTheme(input?: ThemeInput): Theme {
  if (!input) return LIGHT_THEME;
  if (typeof input === 'string') return THEMES[input] ?? LIGHT_THEME;
  const base = THEMES[input.base ?? 'light'] ?? LIGHT_THEME;
  return merge(base as unknown as Record<string, unknown>, input as Record<string, unknown>) as unknown as Theme;
}

/** The theme currently in effect, read by the chrome renderers. */
export const THEME: Theme = { ...LIGHT_THEME };

/** Apply a resolved theme: update the live THEME and the shared FONTS tokens. */
export function applyTheme(theme: Theme): void {
  Object.assign(THEME, theme);
  const ff = theme.fontFamily;
  FONTS.title = { 'font-size': theme.title.fontSize, 'font-weight': theme.title.fontWeight, fill: theme.title.color, 'font-family': ff };
  FONTS.subtitle = { 'font-size': theme.subtitle.fontSize, fill: theme.subtitle.color, 'font-family': ff };
  FONTS.axisLabel = { 'font-size': '11px', fill: theme.axis.labelColor, 'font-family': ff };
  FONTS.axisTitle = { 'font-size': '12px', fill: theme.axis.titleColor, 'font-family': ff };
  FONTS.legend = { 'font-size': '12px', fill: theme.legend.color, 'font-family': ff };
  FONTS.dataLabel = { 'font-size': '11px', fill: theme.dataLabel.color, 'font-family': ff };
}
