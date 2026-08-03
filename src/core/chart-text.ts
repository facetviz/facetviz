/** Free-positioned text blocks rendered in chart (SVG) coordinates. */

import type { ChartTextOptions } from "./options.js";
import type { Renderer } from "./renderer.js";
import { FONTS } from "./defaults.js";
import { sanitizeStyle } from "./utils.js";

export interface ChartTextRenderContext {
  renderer: Renderer;
  width: number;
  height: number;
  texts: ChartTextOptions[];
}

/** Render text above chart content at alignment-based chart positions. */
export function renderChartTexts(ctx: ChartTextRenderContext): void {
  const items = ctx.texts.filter((item) => item.enabled !== false);
  if (!items.length) return;

  const layer = ctx.renderer.group(
    { class: "facet-chart-texts" },
    ctx.renderer.root,
  );

  for (const item of items) {
    if (!item.text) continue;
    const align = item.align ?? "left";
    const verticalAlign = item.verticalAlign ?? "top";
    const x =
      (align === "left" ? 0 : align === "right" ? ctx.width : ctx.width / 2) +
      (item.offsetX ?? 0);
    const y =
      (verticalAlign === "top"
        ? 0
        : verticalAlign === "bottom"
          ? ctx.height
          : ctx.height / 2) + (item.offsetY ?? 0);
    const style: Record<string, string> = {
      ...FONTS.dataLabel,
      ...(item.color ? { fill: item.color } : {}),
      ...sanitizeStyle(item.style as Record<string, string>),
    };
    const fontSize = parseFloat(style["font-size"] ?? "11") || 11;
    const lineHeight = item.lineHeight ?? fontSize * 1.2;
    const lines = item.text.split("\n");
    // Position lines by an explicit alphabetic baseline instead of relying on
    // `dominant-baseline: hanging`. The latter is inconsistent across SVG
    // renderers and can place top-aligned glyphs above y=0, clipping them.
    const textHeight = fontSize + lineHeight * (lines.length - 1);
    const top =
      verticalAlign === "top"
        ? y
        : verticalAlign === "bottom"
          ? y - textHeight
          : y - textHeight / 2;
    const className = item.className ? ` ${item.className}` : "";
    const group = ctx.renderer.group(
      {
        class: `facet-chart-text${className}`,
        transform: item.rotation ? `rotate(${item.rotation} ${x} ${y})` : undefined,
      },
      layer,
    );

    const text = ctx.renderer.text(
      "",
      x,
      top + fontSize,
      {
        ...style,
        "text-anchor":
          align === "left" ? "start" : align === "right" ? "end" : "middle",
        "dominant-baseline": "auto",
        class: "facet-chart-text-content",
      },
      group,
    );
    lines.forEach((line, index) => {
      const tspan = ctx.renderer.create(
        "tspan",
        { x, y: top + fontSize + index * lineHeight },
        text,
      );
      tspan.textContent = line;
    });
  }
}
