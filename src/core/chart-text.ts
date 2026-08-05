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
  /** Multiplier for explicit font sizes -- see `chartTextScale`. */
  textScale: number;
}

/**
 * The style a positioned text is drawn with. Exported so the chart's own
 * space reservation measures exactly what this module will render -- the two
 * derive the font size the same way and must never drift apart.
 *
 * An explicit `fontSize` is scaled by `textScale` rather than the chrome font
 * scale `sanitizeStyle` applies, so the text keeps its share of the card at
 * any size (see `chartTextScale`).
 */
export function resolveChartTextStyle(
  item: ChartTextOptions,
  textScale: number,
): Record<string, string> {
  const style: Record<string, string> = {
    ...FONTS.dataLabel,
    ...(item.color ? { fill: item.color } : {}),
    ...sanitizeStyle(item.style as Record<string, string>),
  };
  const configured = (item.style as Record<string, unknown> | undefined)
    ?.fontSize;
  const size = parseFloat(String(configured ?? ''));
  if (Number.isFinite(size)) {
    const unit = /[a-z%]+$/i.exec(String(configured))?.[0] ?? 'px';
    style['font-size'] = `${size * textScale}${unit}`;
  }
  return style;
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
    // Offsets scale with the text they nudge, so the gap the author left
    // between a text and the edge stays the same share of the card at every
    // size -- a fixed 20px would be a tenth of a thumbnail but a fiftieth of
    // a full-width tile, drifting the block as the card grows.
    const x =
      (align === "left" ? 0 : align === "right" ? ctx.width : ctx.width / 2) +
      (item.offsetX ?? 0) * ctx.textScale;
    const y =
      (verticalAlign === "top"
        ? 0
        : verticalAlign === "bottom"
          ? ctx.height
          : ctx.height / 2) + (item.offsetY ?? 0) * ctx.textScale;
    const style = resolveChartTextStyle(item, ctx.textScale);
    const fontSize = parseFloat(style["font-size"] ?? "11") || 11;
    const lineHeight =
      item.lineHeight != null ? item.lineHeight * ctx.textScale : fontSize * 1.2;
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
