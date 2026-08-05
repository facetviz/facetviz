/** Draws point markers (circle, square, diamond, triangle) for series. */

import type { Renderer } from "../core/renderer.js";
import { FONT_SCALE_STATE } from "../core/theme.js";

export interface MarkerSpec {
  symbol: "circle" | "square" | "diamond" | "triangle" | "rectangle";
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  width?: number; // for rectangle symbol only
  height?: number; // for rectangle symbol only
}

export function drawMarker(
  renderer: Renderer,
  parent: SVGGElement,
  cx: number,
  cy: number,
  spec: MarkerSpec,
): SVGElement {
  const { symbol, fill, stroke, strokeWidth } = spec;
  // `radius`/`width`/`height` are authored as reference-size px, same
  // convention as font sizes (theme.ts) and columnWidth (column.ts) --
  // without the FONT_SCALE_STATE multiplier they'd stay pinned at their
  // author-time size while every positional thing around them (point
  // coordinates) grows/shrinks with the chart, so markers drift out of
  // proportion on any chart that isn't rendered at the reference size.
  const scale = FONT_SCALE_STATE.scale;
  const r = spec.radius * scale;
  const common = {
    fill,
    stroke,
    "stroke-width": strokeWidth,
    class: "facet-point",
  };

  switch (symbol) {
    case "square":
      return renderer.create(
        "rect",
        { x: cx - r, y: cy - r, width: r * 2, height: r * 2, ...common },
        parent,
      );
    case "diamond":
      return renderer.create(
        "polygon",
        {
          points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`,
          ...common,
        },
        parent,
      );
    case "triangle":
      return renderer.create(
        "polygon",
        {
          points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`,
          ...common,
        },
        parent,
      );
    case "rectangle": {
      const w = (spec.width ?? spec.radius * 2) * scale;
      const h = (spec.height ?? spec.radius * 2) * scale;
      return renderer.create(
        "rect",
        { x: cx - w / 2, y: cy - h / 2, width: w, height: h, ...common },
        parent,
      );
    }
    case "circle":
    default:
      return renderer.create("circle", { cx, cy, r, ...common }, parent);
  }
}
