/** Pixel-space path builders shared by line, spline, step and area series. */

export interface Pt {
  x: number;
  y: number;
}

/** Straight polyline through the points. */
export function linePath(pts: Pt[]): string {
  if (!pts.length) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
}

/**
 * Smooth curve using a Catmull-Rom spline converted to cubic beziers.
 * Produces the characteristic Highcharts "spline" look without overshoot
 * tuning knobs — good enough for a hand-maintained library.
 */
export function splinePath(pts: Pt[], tension = 0.5): string {
  if (pts.length < 3) return linePath(pts);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Step line: hold the previous y until the next x (mid-step). */
export function stepPath(pts: Pt[]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const midX = (pts[i - 1].x + pts[i].x) / 2;
    d += ` L ${midX} ${pts[i - 1].y} L ${midX} ${pts[i].y} L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

/** Close a line path down to a baseline to make an area fill. */
export function areaPath(pts: Pt[], baseline: number, lineFn: (p: Pt[]) => string): string {
  if (!pts.length) return '';
  const top = lineFn(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${top} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}
