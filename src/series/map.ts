/**
 * Map — areas (countries, states…) filled by their data, and points placed
 * by longitude and latitude. Self-contained (non-cartesian).
 *
 * The outlines come with the series as GeoJSON polygons (`features`), each
 * with an `id`; a data point `{ key, color?, value? }` fills the area whose
 * id is its key, and areas without one are drawn in `emptyColor`. A data
 * point `{ lon, lat, radius?, color? }` is a dot. Longitude/latitude are
 * projected with Equal Earth (`projection: "equalEarth"`, the default), or
 * taken as they are with `"planar"` for outlines already projected (x right,
 * y down). The whole map is fitted to the plot, keeping its shape.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';
import type { Point } from '../core/point.js';

type Ring = [number, number][];

/** An outline: a polygon or several. */
export interface MapGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Ring[] | Ring[][];
}

export interface MapFeature {
  id: string;
  name?: string;
  geometry: MapGeometry | null;
}

/** Map series options, beside the common ones. */
export interface MapSeriesOptions {
  features?: MapFeature[];
  /** "equalEarth" (longitude/latitude in degrees) or "planar" (already projected). */
  projection?: 'equalEarth' | 'planar';
  /** Areas with no data point. */
  emptyColor?: string;
  /** Outlines between areas. */
  borderColor?: string;
  borderWidth?: number;
}

/** Map point fields: an area's key, or a dot's place and size. */
export interface MapPointOptions {
  key?: string | null;
  lon?: number;
  lat?: number;
  radius?: number;
}

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
const M = Math.sqrt(3) / 2;

/** Equal Earth (Šavrič, Patterson & Jenny, 2018): degrees to plane units, y up. */
export function equalEarth(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const t = Math.asin(M * Math.sin(p));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

function polygons(g: MapGeometry): Ring[][] {
  return g.type === 'Polygon' ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]);
}

export class MapSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-map ${this.name}` }, renderer.root);
    const o = this.options as typeof this.options & MapSeriesOptions;
    const planar = o.projection === 'planar';
    // Plane coordinates, y down.
    const project = (x: number, y: number): [number, number] => {
      if (planar) return [x, y];
      const [px, py] = equalEarth(x, y);
      return [px, -py];
    };

    const shapes = (o.features ?? []).flatMap((f) => (f.geometry ? [{ f, polys: polygons(f.geometry).map((poly) => poly.map((ring) => ring.map(([x, y]) => project(x, y)))) }] : []));
    const dots = this.points.filter((p) => Number.isFinite(p.options.lon) && Number.isFinite(p.options.lat)).map((p) => ({ p, at: project(p.options.lon as number, p.options.lat as number) }));

    // Fit everything drawn to the plot, keeping its shape.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = ([x, y]: [number, number]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (const s of shapes) for (const poly of s.polys) for (const ring of poly) ring.forEach(grow);
    dots.forEach((d) => grow(d.at));
    if (!Number.isFinite(minX)) return;
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const pad = 4;
    const scale = Math.min((plot.width - 2 * pad) / w, (plot.height - 2 * pad) / h);
    const ox = plot.x + (plot.width - w * scale) / 2 - minX * scale;
    const oy = plot.y + (plot.height - h * scale) / 2 - minY * scale;
    const place = ([x, y]: [number, number]) => [ox + x * scale, oy + y * scale];

    const byKey = new Map<string, Point>();
    for (const p of this.points) if (p.options.key != null) byKey.set(String(p.options.key), p);
    const wire = (el: SVGElement, p: Point) => {
      ctx.registerHover(el, p);
      el.addEventListener('click', (e: Event) => ctx.onPointEvent('click', p, e));
      el.addEventListener('mouseover', (e: Event) => ctx.onPointEvent('mouseOver', p, e));
      el.addEventListener('mouseout', (e: Event) => ctx.onPointEvent('mouseOut', p, e));
    };

    for (const s of shapes) {
      const d = s.polys
        .map((poly) =>
          poly
            .map((ring) => ring.map((pt, i) => { const [x, y] = place(pt); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('') + 'Z')
            .join(''),
        )
        .join('');
      const p = byKey.get(s.f.id);
      const el = renderer.create('path', {
        d,
        fill: p?.color ?? o.emptyColor ?? '#e9e8e4',
        'fill-rule': 'evenodd',
        stroke: o.borderColor ?? '#ffffff',
        'stroke-width': o.borderWidth ?? 0.6,
        class: p ? 'facet-point facet-map-area' : 'facet-map-area facet-map-empty',
        'data-id': s.f.id,
      }, g);
      if (p) wire(el, p);
    }

    for (const { p, at } of dots) {
      const [x, y] = place(at);
      const el = renderer.create('circle', {
        cx: x, cy: y, r: (p.options.radius as number | undefined) ?? 4,
        fill: p.color ?? this.color, 'fill-opacity': 0.75,
        stroke: '#ffffff', 'stroke-width': 0.8, class: 'facet-point facet-map-dot',
      }, g);
      wire(el, p);
    }
  }
}
