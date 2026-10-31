/** Shared polar geometry for Cartesian series rendered in a polar frame. */

import type { SeriesRenderContext } from "./base.js";
import type { Pt } from "./paths.js";

export function polarCenter(ctx: SeriesRenderContext): Pt {
  return {
    x: ctx.plot.x + ctx.plot.width / 2,
    y: ctx.plot.y + ctx.plot.height / 2,
  };
}

export function polarPoint(
  ctx: SeriesRenderContext,
  xValue: number | string,
  yValue: number,
): Pt {
  const x = ctx.xScale.scale(xValue);
  const y = ctx.yScale.scale(yValue);
  const angle = ctx.inverted ? y : x;
  const radius = ctx.inverted ? x : y;
  const center = polarCenter(ctx);
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

export function projectPolar(
  plot: SeriesRenderContext["plot"],
  angle: number,
  radius: number,
): Pt {
  return {
    x: plot.x + plot.width / 2 + Math.cos(angle) * radius,
    y: plot.y + plot.height / 2 + Math.sin(angle) * radius,
  };
}

export function annularSectorPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  cornerRadius = 0,
): string {
  const inner = Math.max(0, Math.min(innerRadius, outerRadius));
  const outer = Math.max(inner, outerRadius);
  if (cornerRadius > 0) {
    const rounded = roundedSectorPath(cx, cy, inner, outer, startAngle, endAngle, cornerRadius);
    if (rounded) return rounded;
  }
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = {
    x: cx + Math.cos(startAngle) * outer,
    y: cy + Math.sin(startAngle) * outer,
  };
  const outerEnd = {
    x: cx + Math.cos(endAngle) * outer,
    y: cy + Math.sin(endAngle) * outer,
  };
  if (inner <= 0.5) {
    return [
      `M ${cx} ${cy}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
      "Z",
    ].join(" ");
  }
  const innerEnd = {
    x: cx + Math.cos(endAngle) * inner,
    y: cy + Math.sin(endAngle) * inner,
  };
  const innerStart = {
    x: cx + Math.cos(startAngle) * inner,
    y: cy + Math.sin(startAngle) * inner,
  };
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

/**
 * A wedge (inner radius 0) or ring piece with its corners rounded by
 * `cornerRadius` px: each corner is a circle touching the radial edge and the
 * arc. The radius shrinks to fit a thin or narrow piece (never more than half
 * its thickness, nor more than its angle leaves room for), so a sliver keeps
 * its size. A wedge's point at the centre stays sharp. Undefined for a full
 * turn (no corners) or an empty piece, for the caller's usual path.
 */
export function roundedSectorPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  cornerRadius: number,
): string | undefined {
  const a0 = Math.min(startAngle, endAngle);
  const a1 = Math.max(startAngle, endAngle);
  const span = a1 - a0;
  const ri = Math.max(0, Math.min(innerRadius, outerRadius));
  const ro = Math.max(ri, outerRadius);
  if (!(cornerRadius > 0) || span <= 1e-6 || span >= Math.PI * 2 - 1e-6 || ro - ri < 0.5) return undefined;
  const half = Math.sin(Math.min(span, Math.PI) / 2);
  const thick = (ro - ri) / 2;
  // Outer corners: the circle's centre sits at ro - rc, rc off the edge.
  const rco = Math.max(0, Math.min(cornerRadius, thick, (ro * half) / (1 + half)));
  // Inner corners: the circle's centre sits at ri + rc.
  const rci = ri > 0.5
    ? Math.max(0, Math.min(cornerRadius, thick, half < 1 ? (ri * half) / (1 - half) : Infinity))
    : 0;
  const at = (r: number, a: number) => `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
  const parts: string[] = [];
  // Outer edge, from the start edge round to the end edge.
  const dO = rco > 0 ? Math.asin(rco / (ro - rco)) : 0;
  const lineO = (ro - rco) * Math.cos(dO);
  if (rco > 0) {
    parts.push(`M ${at(lineO, a0)}`, `A ${rco} ${rco} 0 0 1 ${at(ro, a0 + dO)}`);
  } else parts.push(`M ${at(ro, a0)}`);
  parts.push(`A ${ro} ${ro} 0 ${span - 2 * dO > Math.PI ? 1 : 0} 1 ${at(ro, a1 - dO)}`);
  if (rco > 0) parts.push(`A ${rco} ${rco} 0 0 1 ${at(lineO, a1)}`);
  if (ri <= 0.5) {
    parts.push(`L ${cx} ${cy}`, "Z");
    return parts.join(" ");
  }
  // Inner edge, back from the end edge to the start edge.
  const dI = rci > 0 ? Math.asin(rci / (ri + rci)) : 0;
  const lineI = (ri + rci) * Math.cos(dI);
  if (rci > 0) {
    parts.push(`L ${at(lineI, a1)}`, `A ${rci} ${rci} 0 0 1 ${at(ri, a1 - dI)}`);
  } else parts.push(`L ${at(ri, a1)}`);
  parts.push(`A ${ri} ${ri} 0 ${span - 2 * dI > Math.PI ? 1 : 0} 0 ${at(ri, a0 + dI)}`);
  if (rci > 0) parts.push(`A ${rci} ${rci} 0 0 1 ${at(lineI, a0)}`);
  parts.push("Z");
  return parts.join(" ");
}

export function circularArcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = Math.min(startAngle, endAngle);
  const end = Math.max(startAngle, endAngle);
  const from = {
    x: cx + Math.cos(start) * radius,
    y: cy + Math.sin(start) * radius,
  };
  const to = {
    x: cx + Math.cos(end) * radius,
    y: cy + Math.sin(end) * radius,
  };
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${to.x} ${to.y}`;
}
