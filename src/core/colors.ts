/** Default categorical palette (Highcharts-inspired) plus colour helpers. */

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
