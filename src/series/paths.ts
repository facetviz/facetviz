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
 * Produces the characteristic smooth "spline" look without overshoot
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

/**
 * A spline that closes on itself (a polar loop): each point's neighbours
 * wrap around, so the curve runs smoothly from the last point back to the
 * first.
 */
export function closedSplinePath(pts: Pt[], tension = 0.5): string {
  if (pts.length < 3) return linePath(pts);
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return `${d} Z`;
}

/**
 * A polar step line: each value held as an arc at its radius halfway to the
 * next point's angle, then a radial jump to the next value. `closed` wraps
 * from the last point back to the first.
 */
export function polarStepPath(
  center: Pt,
  pts: Array<{ angle: number; radius: number }>,
  closed: boolean,
): string {
  if (!pts.length) return '';
  const at = (angle: number, radius: number) =>
    `${center.x + Math.cos(angle) * radius} ${center.y + Math.sin(angle) * radius}`;
  const arc = (radius: number, from: number, to: number) =>
    `A ${radius} ${radius} 0 ${Math.abs(to - from) > Math.PI ? 1 : 0} ${to > from ? 1 : 0} ${at(to, radius)}`;
  let d = `M ${at(pts[0].angle, pts[0].radius)}`;
  const steps = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < steps; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // The wrap from the last point runs on round to the first.
    const next = i + 1 === pts.length ? b.angle + Math.PI * 2 : b.angle;
    const mid = (a.angle + next) / 2;
    d += ` ${arc(a.radius, a.angle, mid)} L ${at(mid, b.radius)} ${arc(b.radius, mid, next)}`;
  }
  return closed ? `${d} Z` : d;
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
