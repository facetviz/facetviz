/** Default categorical palette (vibrant, high-contrast) plus colour helpers. */

export const DEFAULT_COLORS = [
  '#2caffe',
  '#544fc5',
  '#00e272',
  '#fe6a35',
  '#6b8abc',
  '#d568fb',
  '#2ee0ca',
  '#fa4b42',
  '#feb56a',
  '#91e8e1',
];

/** Cyclic palette accessor. */
export function paletteColor(colors: string[], index: number): string {
  return colors[index % colors.length];
}

/** Parse `#rgb`/`#rrggbb` into [r,g,b]. Returns null for other formats. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour by a ratio. */
/** Light text on a dark fill, dark text on a light one (hex or rgb()). */
export function textOn(fill: string): string {
  const hex = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(fill);
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(fill);
  const parts = hex ? [hex[1], hex[2], hex[3]].map((h) => parseInt(h, 16)) : rgb ? [rgb[1], rgb[2], rgb[3]].map(Number) : null;
  if (!parts) return '#fff';
  const [r, g, b] = parts.map((v) => v / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#1f2328' : '#fff';
}

export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const adjust = (c: number) =>
    Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const [r, g, b] = rgb.map(adjust);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Semi-transparent rgba() from a hex colour — handy for area fills. */
export function alpha(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

/** Linearly interpolate between two hex colours (`t` in 0..1). */
export function lerpColor(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const k = Math.max(0, Math.min(1, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
