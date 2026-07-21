/**
 * HTML-overlay tooltip. Rendered as an absolutely-positioned div above the SVG
 * so text wrapping and styling stay easy. Content is user-configurable via a
 * token `format` string or a `formatter` callback.
 */

import type { TooltipOptions, TooltipContext, SeriesTooltipOptions } from './options.js';
import { escapeHTML, formatHTMLString, formatNumber } from './utils.js';

interface ContainerAnchorState {
  count: number;
  changed: boolean;
  originalPosition: string;
}

const containerAnchors = new WeakMap<HTMLElement, ContainerAnchorState>();

export class Tooltip {
  private el: HTMLDivElement;
  private options: TooltipOptions;
  private anchorState: ContainerAnchorState;

  constructor(private container: HTMLElement, options: TooltipOptions) {
    this.options = options;
    this.el = document.createElement('div');
    this.el.className = 'facet-tooltip';
    Object.assign(this.el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      padding: '6px 10px',
      font: '12px sans-serif',
      background: options.backgroundColor ?? 'rgba(255,255,255,0.95)',
      border: `1px solid ${options.borderColor ?? '#ccc'}`,
      borderRadius: '4px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      color: options.color ?? '#333',
      whiteSpace: 'nowrap',
      transition: 'opacity 0.08s',
      opacity: '0',
      zIndex: '10',
    } as CSSStyleDeclaration);
    // Ensure the container can anchor absolute children. Reference counting
    // keeps multiple charts/tooltips in one container from restoring too soon.
    const existingAnchor = containerAnchors.get(container);
    if (existingAnchor) {
      existingAnchor.count++;
      this.anchorState = existingAnchor;
    } else {
      const changed = getComputedStyle(container).position === 'static';
      this.anchorState = {
        count: 1,
        changed,
        originalPosition: container.style.position,
      };
      containerAnchors.set(container, this.anchorState);
      if (changed) {
        container.style.position = 'relative';
      }
    }
    container.appendChild(this.el);
  }

  show(ctx: TooltipContext, seriesTip?: SeriesTooltipOptions): void {
    if (this.options.enabled === false || seriesTip?.enabled === false) return;
    this.el.innerHTML = this.content(ctx, seriesTip);
    this.el.style.opacity = '1';
  }

  move(clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const gap = 12;
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    // Prefer the cursor's bottom-right, flipping to whichever side of the
    // cursor actually has room first — better than clamping straight away,
    // which would otherwise plant the tooltip right under the pointer. Then
    // clamp into the container regardless, so it stays fully visible even in
    // a corner, or a container too short/narrow for either preferred side.
    let x = cx + gap + w <= rect.width ? cx + gap : cx - gap - w;
    let y = cy + gap + h <= rect.height ? cy + gap : cy - gap - h;
    x = Math.max(0, Math.min(x, rect.width - w));
    y = Math.max(0, Math.min(y, rect.height - h));

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  hide(): void {
    this.el.style.opacity = '0';
  }

  destroy(): void {
    this.el.remove();
    this.anchorState.count--;
    if (this.anchorState.count === 0) {
      if (this.anchorState.changed)
        this.container.style.position = this.anchorState.originalPosition;
      containerAnchors.delete(this.container);
    }
  }

  private content(ctx: TooltipContext, tip?: SeriesTooltipOptions): string {
    const opts = { ...this.options, ...tip };
    // A formatter is an explicitly trusted HTML escape hatch. All built-in
    // rendering and format-string substitutions below escape user data.
    if (opts.formatter) return opts.formatter(ctx);
    const fmt = (v: number | undefined) =>
      formatNumber(v, { decimals: opts.valueDecimals, prefix: opts.valuePrefix, suffix: opts.valueSuffix });
    const valueStr = fmt(ctx.y);

    // Shared tooltip: one header (the x) then a row per series.
    if (ctx.points && ctx.points.length) {
      const rows = ctx.points.map((r) =>
        `<span style="color:${escapeHTML(r.color)}">●</span> ${escapeHTML(r.series)}: <b>${escapeHTML(fmt(r.y))}</b>`,
      );
      return `<b>${escapeHTML(ctx.x)}</b><br/>${rows.join('<br/>')}`;
    }

    if (opts.format) {
      // Provide raw numbers so format specs (`{y:,.1f}`) work, plus `{yFormatted}`
      // for the value with the tooltip's prefix/suffix/decimals already applied.
      return formatHTMLString(opts.format, {
        series: ctx.series,
        x: ctx.x,
        name: ctx.name ?? ctx.point?.name ?? ctx.x,
        y: ctx.y,
        yFormatted: valueStr,
        index: ctx.index,
        percentage: ctx.percentage,
        total: ctx.total,
        low: ctx.low,
        high: ctx.high,
        point: ctx.point,
        color: ctx.color,
      });
    }

    // Axis label as the header, series name + value(s) in the bullet row
    // below it — the same convention the shared tooltip above uses.
    const head = `<b>${escapeHTML(ctx.x)}</b>`;
    const bullet = `<span style="color:${escapeHTML(ctx.color)}">●</span>`;
    const series = escapeHTML(ctx.series);

    // Boxplot five-number summary.
    if (ctx.box) {
      const b = ctx.box;
      const row = (k: string, v: number) => `${k}: <b>${escapeHTML(fmt(v))}</b>`;
      const rows = [row('Maximum', b.max), row('Upper quartile', b.q3), row('Median', b.median),
         row('Lower quartile', b.q1), row('Minimum', b.min)];
      if (b.outliers?.length)
        rows.push(`Outliers: <b>${b.outliers.map((v) => escapeHTML(fmt(v))).join(', ')}</b>`);
      return `${head}<br/>${bullet} <b>${series}</b><br/>` + rows.join('<br/>');
    }

    // Range (low/high).
    if (ctx.low !== undefined && ctx.high !== undefined) {
      return `${head}<br/>${bullet} ${series}: <b>${escapeHTML(fmt(ctx.low))}</b> – <b>${escapeHTML(fmt(ctx.high))}</b>`;
    }

    return `${head}<br/>${bullet} ${series}: <b>${escapeHTML(valueStr)}</b>`;
  }
}
