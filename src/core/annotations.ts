/** Value-anchored labels and callouts rendered over a chart plot. */

import type { Renderer } from "./renderer.js";
import type { Rect } from "./axis.js";
import type { Scale } from "./scale.js";
import type { AnnotationOptions } from "./options.js";
import { FONTS } from "./defaults.js";
import { sanitizeStyle } from "./utils.js";

export interface AnnotationRenderContext {
  renderer: Renderer;
  plot: Rect;
  annotations: AnnotationOptions[];
  xScale: Scale;
  yScale: Scale;
  xScale2?: Scale;
  yScale2?: Scale;
  layer: "below" | "above";
  project?: (angle: number, radius: number) => { x: number; y: number };
}

export function renderAnnotations(ctx: AnnotationRenderContext): void {
  const items = ctx.annotations.filter(
    (annotation) => (annotation.zIndex ?? "above") === ctx.layer,
  );
  if (!items.length) return;
  const group = ctx.renderer.group(
    { class: `facet-annotations facet-annotations-${ctx.layer}` },
    ctx.renderer.root,
  );

  for (const annotation of items) {
    const xScale = annotation.xAxis === 1 && ctx.xScale2 ? ctx.xScale2 : ctx.xScale;
    const yScale = annotation.yAxis === 1 && ctx.yScale2 ? ctx.yScale2 : ctx.yScale;
    let anchor = {
      x:
        annotation.x === undefined
          ? ctx.plot.x + ctx.plot.width / 2
          : xScale.scale(annotation.x),
      y:
        annotation.y === undefined
          ? ctx.plot.y + ctx.plot.height / 2
          : yScale.scale(annotation.y),
    };
    if (ctx.project && annotation.x !== undefined && annotation.y !== undefined)
      anchor = ctx.project(xScale.scale(annotation.x), yScale.scale(annotation.y));

    const color = annotation.color ?? "#334155";
    const radius = annotation.radius ?? 4;
    const shape = annotation.shape ?? (annotation.text ? "callout" : "circle");
    const labelX = anchor.x + (annotation.dx ?? 16);
    const labelY = anchor.y + (annotation.dy ?? -16);

    if (shape === "circle") {
      ctx.renderer.create(
        "circle",
        {
          cx: anchor.x,
          cy: anchor.y,
          r: radius,
          fill: annotation.backgroundColor ?? "none",
          stroke: annotation.borderColor ?? color,
          "stroke-width": annotation.borderWidth ?? 2,
          class: "facet-annotation-anchor",
        },
        group,
      );
    } else {
      ctx.renderer.create(
        "circle",
        {
          cx: anchor.x,
          cy: anchor.y,
          r: radius,
          fill: color,
          stroke: "#fff",
          "stroke-width": 1,
          class: "facet-annotation-anchor",
        },
        group,
      );
    }

    if (!annotation.text) continue;
    if (shape === "callout") {
      ctx.renderer.create(
        "line",
        {
          x1: anchor.x,
          y1: anchor.y,
          x2: labelX,
          y2: labelY,
          stroke: annotation.borderColor ?? color,
          "stroke-width": annotation.borderWidth ?? 1,
          class: "facet-annotation-connector",
        },
        group,
      );
    }

    const style = {
      ...FONTS.axisLabel,
      fill: color,
      ...sanitizeStyle(annotation.style),
    };
    const padding = annotation.padding ?? 5;
    const metrics = ctx.renderer.measureText(annotation.text, style);
    const box = {
      x: labelX - padding,
      y: labelY - metrics.height + 1 - padding,
      width: metrics.width + padding * 2,
      height: metrics.height + padding * 2,
    };
    ctx.renderer.create(
      "rect",
      {
        ...box,
        rx: 4,
        fill: annotation.backgroundColor ?? "rgba(255,255,255,0.92)",
        stroke: annotation.borderColor ?? color,
        "stroke-width": annotation.borderWidth ?? 1,
        class: "facet-annotation-label-box",
      },
      group,
    );
    ctx.renderer.text(
      annotation.text,
      labelX,
      labelY,
      {
        ...style,
        "dominant-baseline": "auto",
        class: "facet-annotation-label",
      },
      group,
    );
  }
}
