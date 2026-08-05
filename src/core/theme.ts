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
import { FONT_SCALE_STATE } from './font-scale-state.js';

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

// Every font size in a chart -- theme chrome (title, axis labels, legend,
// data labels) and the caller's own positioned `texts` -- is authored for a
// chart the size of the 640x400 constructor fallback (chart.ts) and scaled
// from there in proportion to the container, the same way the KPI
// free-layout SVG scales via its viewBox.
//
// "Size" here is the geometric mean of the two sides, not the shorter one.
// Cards vary far more in width than in height (a dashboard tile and a list
// thumbnail are both short), so keying off the shorter side made the scale
// blind to the dimension that actually changes: a 943x302 card and a 640x302
// one rendered identical chrome despite 1.5x the area, and -- being short --
// a 943x302 card came out *smaller* than the 640x400 reference it is
// larger than. The geometric mean tracks both sides, so a chart's text is
// sized by how big the chart really is.
//
// The reference is that same 640x400 measured the same way, so a chart at
// the canonical size still renders every font at exactly its authored size.
const FONT_SCALE_REFERENCE_PX = Math.sqrt(640 * 400);
const FONT_SCALE_MIN = 0.7;
const FONT_SCALE_MAX = 1.6;

/** Proportional size of `width` x `height` against the reference chart. */
function sizeRatio(width: number, height: number): number {
  const area = Math.max(0, width) * Math.max(0, height);
  return Math.sqrt(area) / FONT_SCALE_REFERENCE_PX;
}

/**
 * Proportional font-size multiplier for a chart of this pixel size, clamped
 * so a thumbnail-sized chart keeps legible (if small) chrome and a very large
 * one doesn't blow up its chrome past readability.
 */
export function chartFontScale(width: number, height: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, sizeRatio(width, height)));
}

// A positioned text is laid out *beside* the plot rather than inside the
// chrome, so what matters is the share of the card it occupies -- and a text
// that has to stay proportional cannot also stop shrinking where chrome
// does. Its floor is therefore low enough to keep the card sizes this
// renders at (down to a list thumbnail) inside the proportional range,
// rather than flattening them onto the floor and handing the same text a
// different share of every card.
const TEXT_SCALE_MIN = 0.3;

/** Proportional font-size multiplier for a chart's positioned `texts`. */
export function chartTextScale(width: number, height: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, sizeRatio(width, height)));
}

// FONT_SCALE_STATE (imported above): `scale` (from `chartFontScale` below)
// always pre-scales the theme defaults set into FONTS by `applyTheme` --
// unconditional, so chrome that never takes a per-instance style override
// (most series' data labels, several axis-title/label spots that only ever
// render the theme default) already scales with zero extra wiring.
// `scaleExplicit` (chart.scaleFonts) additionally makes `sanitizeStyle`
// (utils.ts) scale a *caller-supplied* `style.fontSize` the same way, since
// every override-capable render site merges its custom style through that
// one shared helper -- see its doc comment for why that keeps the two knobs
// from double-applying. Read there and in `applyTheme`, both synchronously
// within the render that wrote them, same contract `FONTS` itself relies on.
export { FONT_SCALE_STATE };

/**
 * Scale a literal reference-size px value by the current render's font
 * scale -- the same unconditional scaling `applyTheme` gives the `FONTS`
 * defaults themselves. For chrome that hardcodes its own smaller/larger
 * size instead of spreading a `FONTS` token verbatim (e.g. a heatmap cell
 * value or calendar day label, deliberately smaller than the shared
 * `dataLabel`/`axisLabel` default) -- read only during a render, same
 * contract as `FONTS` and `FONT_SCALE_STATE` itself.
 */
export function scaledFontPx(px: number): string {
  return `${px * FONT_SCALE_STATE.scale}px`;
}

/**
 * Apply a resolved theme: update the live THEME and the shared FONTS tokens,
 * scaling every default font size by `fontScale` (1 = author-time size, from
 * `chartFontScale`). Also records `fontScale`/`scaleExplicit` into
 * {@link FONT_SCALE_STATE} for `sanitizeStyle` to apply to explicit
 * `style.fontSize` overrides when `scaleExplicit` (chart.scaleFonts) is on.
 */
export function applyTheme(theme: Theme, fontScale = 1, scaleExplicit = false): void {
  Object.assign(THEME, theme);
  FONT_SCALE_STATE.scale = fontScale;
  FONT_SCALE_STATE.scaleExplicit = scaleExplicit;
  const ff = theme.fontFamily;
  const scalePx = (px: string) => `${(parseFloat(px) || 0) * fontScale}px`;
  FONTS.title = { 'font-size': scalePx(theme.title.fontSize), 'font-weight': theme.title.fontWeight, fill: theme.title.color, 'font-family': ff };
  FONTS.subtitle = { 'font-size': scalePx(theme.subtitle.fontSize), fill: theme.subtitle.color, 'font-family': ff };
  FONTS.axisLabel = { 'font-size': scalePx('11px'), fill: theme.axis.labelColor, 'font-family': ff };
  FONTS.axisTitle = { 'font-size': scalePx('12px'), fill: theme.axis.titleColor, 'font-family': ff };
  FONTS.legend = { 'font-size': scalePx('12px'), fill: theme.legend.color, 'font-family': ff };
  FONTS.dataLabel = { 'font-size': scalePx('11px'), fill: theme.dataLabel.color, 'font-family': ff };
}
