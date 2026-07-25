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
): string {
  const inner = Math.max(0, Math.min(innerRadius, outerRadius));
  const outer = Math.max(inner, outerRadius);
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
