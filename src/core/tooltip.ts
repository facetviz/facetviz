/**
 * HTML-overlay tooltip. Rendered as an absolutely-positioned div above the SVG
 * so text wrapping and styling stay easy. Content is user-configurable via a
 * token `format` string or a `formatter` callback.
 */

import type { TooltipOptions, TooltipContext, SeriesTooltipOptions } from './options.js';
import { formatString, formatNumber } from './utils.js';

export class Tooltip {
  private el: HTMLDivElement;
  private options: TooltipOptions;

  constructor(private container: HTMLElement, options: TooltipOptions) {
    this.options = options;
    this.el = document.createElement('div');
    this.el.className = 'jchart-tooltip';
    Object.assign(this.el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      padding: '6px 10px',
      font: '12px sans-serif',
      background: options.backgroundColor ?? 'rgba(255,255,255,0.95)',
      border: `1px solid ${options.borderColor ?? '#ccc'}`,
      borderRadius: '4px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      color: '#333',
      whiteSpace: 'nowrap',
      transition: 'opacity 0.08s',
      opacity: '0',
      zIndex: '10',
    } as CSSStyleDeclaration);
    // Ensure the container can anchor an absolute child.
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(this.el);
  }

  show(ctx: TooltipContext, seriesTip?: SeriesTooltipOptions): void {
    if (this.options.enabled === false) return;
    this.el.innerHTML = this.content(ctx, seriesTip);
    this.el.style.opacity = '1';
  }

  move(clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    let x = clientX - rect.left + 12;
    let y = clientY - rect.top + 12;
    // Keep inside the container horizontally.
    const w = this.el.offsetWidth;
    if (x + w > rect.width) x = clientX - rect.left - w - 12;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  hide(): void {
    this.el.style.opacity = '0';
  }

  destroy(): void {
    this.el.remove();
  }

  private content(ctx: TooltipContext, tip?: SeriesTooltipOptions): string {
    const opts = { ...this.options, ...tip };
    if (opts.formatter) return opts.formatter(ctx);
    const fmt = (v: number | undefined) =>
      formatNumber(v, { decimals: opts.valueDecimals, prefix: opts.valuePrefix, suffix: opts.valueSuffix });
    const valueStr = fmt(ctx.y);

    if (opts.format) {
      return formatString(opts.format, {
        series: ctx.series,
        x: ctx.x,
        y: valueStr,
        low: fmt(ctx.low),
        high: fmt(ctx.high),
        point: ctx.point,
        color: ctx.color,
      });
    }

    const head = `<span style="color:${ctx.color}">●</span> <b>${ctx.series}</b><br/>${ctx.x}`;

    // Boxplot five-number summary.
    if (ctx.box) {
      const b = ctx.box;
      const row = (k: string, v: number) => `${k}: <b>${fmt(v)}</b>`;
      return (
        `${head}<br/>` +
        [row('Maximum', b.max), row('Upper quartile', b.q3), row('Median', b.median),
         row('Lower quartile', b.q1), row('Minimum', b.min)].join('<br/>')
      );
    }

    // Range (low/high).
    if (ctx.low !== undefined && ctx.high !== undefined) {
      return `${head}<br/>${fmt(ctx.low)} – <b>${fmt(ctx.high)}</b>`;
    }

    return `${head}: <b>${valueStr}</b>`;
  }
}
