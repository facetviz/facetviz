/**
 * Thin, dependency-free wrapper around the SVG DOM.
 *
 * Every other module draws through this class and never touches
 * `document.createElementNS` directly. That keeps the SVG-specific knowledge in
 * one file: if the rendering backend ever changed (canvas, server-side string
 * output, etc.) only this module would need to be rewritten.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export type Attrs = Record<string, string | number | undefined | null>;

export class Renderer {
  readonly root: SVGSVGElement;

  constructor(width: number, height: number) {
    this.root = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.root.setAttribute('xmlns', SVG_NS);
    this.setSize(width, height);
    this.root.setAttribute('class', 'jchart-root');
    // Never overflow the parent: scale down responsively if the container is
    // narrower than the intrinsic width.
    this.root.style.maxWidth = '100%';
    this.root.style.height = 'auto';
    this.root.style.display = 'block';
  }

  setSize(width: number, height: number): void {
    this.root.setAttribute('width', String(width));
    this.root.setAttribute('height', String(height));
    this.root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  /** Create an SVG element with attributes, optionally appending to a parent. */
  create<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Attrs = {},
    parent?: SVGElement,
  ): SVGElementTagNameMap[K] {
    const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
    this.attr(el, attrs);
    if (parent) parent.appendChild(el);
    return el;
  }

  /** A grouping <g>, the usual container for a logical chart part. */
  group(attrs: Attrs = {}, parent?: SVGElement): SVGGElement {
    return this.create('g', attrs, parent ?? this.root);
  }

  attr(el: SVGElement, attrs: Attrs): void {
    for (const key in attrs) {
      const value = attrs[key];
      if (value === undefined || value === null) continue;
      el.setAttribute(key, String(value));
    }
  }

  /** Positioned, styleable text. Returns the element so callers can measure it. */
  text(
    content: string,
    x: number,
    y: number,
    attrs: Attrs = {},
    parent?: SVGElement,
  ): SVGTextElement {
    const el = this.create('text', { x, y, ...attrs }, parent ?? this.root);
    el.textContent = content;
    return el;
  }

  /** Build an SVG path `d` string from segment tokens. */
  static path(segments: Array<(string | number)[]>): string {
    return segments.map((s) => s.join(' ')).join(' ');
  }

  clear(): void {
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root);
  }
}
