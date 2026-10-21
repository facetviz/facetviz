/**
 * Map — areas (countries, states…) filled by their data, and points placed
 * by longitude and latitude. Self-contained (non-cartesian).
 *
 * The outlines come with the series as GeoJSON polygons (`features`), each
 * with an `id`; a data point `{ key, color?, value? }` fills the area whose
 * id is its key, and areas without one are drawn in `emptyColor`. A data
 * point `{ lon, lat, radius?, color? }` is a dot. Longitude/latitude are
 * projected with Equal Earth (`projection: "equalEarth"`, the default, for
 * the whole world: true areas), Mercator (`"mercator"`, for a country or a
 * region: true local shapes, as most maps of one show it), or taken as they
 * are with `"planar"` for outlines already projected (x right, y down). The
 * whole map is fitted to the plot, keeping its shape.
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
  /** "equalEarth" or "mercator" (longitude/latitude in degrees), or
   * "planar" (already projected). */
  projection?: 'equalEarth' | 'mercator' | 'planar';
  /** Areas with no data point. */
  emptyColor?: string;
  /** Outlines between areas. */
  borderColor?: string;
  borderWidth?: number;
  /** What the map is fitted to: everything drawn ("all", the default), or
   * the dots ("data"), with a margin, the rest cut off at the plot's edge. */
  fit?: 'all' | 'data';
  /** The longitude at the middle of the map (default 0): areas far from it
   * are drawn skewed, so a map of one region is best centred on it. "auto"
   * is the dots' middle, else the areas'. With fit "data" and no centre,
   * the dots' middle. */
  center?: number | 'auto';
  /** Fitted to the dots: the narrowest span shown, in degrees of longitude
   * at the equator (default 12), so one dot isn't shown at street level. */
  minSpan?: number;
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

/** Mercator's furthest latitude: past it the poles run off to infinity. */
const MERCATOR_MAX_LAT = 85;

/** Mercator: degrees to plane units (radians of longitude), y up. Shapes
 * are true locally, sizes grow towards the poles. */
export function mercator(lon: number, lat: number): [number, number] {
  const p = (Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat)) * Math.PI) / 180;
  return [(lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + p / 2))];
}

function polygons(g: MapGeometry): Ring[][] {
  return g.type === 'Polygon' ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]);
}

/** A longitude within −180…180. */
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** The middle of longitudes, the short way round the globe (Suva at 178°
 * and Auckland at 175° are in the middle of the Pacific, not of Africa). */
export function middleLongitude(lons: number[]): number {
  if (!lons.length) return 0;
  const sorted = [...lons].map(wrap).sort((a, b) => a - b);
  // The widest gap between neighbours (round the back too) is outside them.
  let gap = sorted[0] + 360 - sorted[sorted.length - 1];
  let start = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gap) {
      gap = sorted[i] - sorted[i - 1];
      start = sorted[i];
    }
  }
  const span = 360 - gap;
  return wrap(start + span / 2);
}

/** The part of a ring on one side of a vertical line (Sutherland–Hodgman). */
function clipX(ring: Ring, at: number, keepBelow: boolean): Ring {
  const inside = (p: [number, number]) => (keepBelow ? p[0] <= at : p[0] >= at);
  const out: Ring = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (at - a[0]) / (b[0] - a[0]);
      out.push([at, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * A polygon that crosses the 180th meridian (Russia, Fiji) cut in two along
 * it, so it isn't drawn as a band across the whole map: its rings are made
 * continuous (no jump of more than 180°), then what runs past ±180 is moved
 * to the other edge.
 */
export function splitAntimeridian(poly: Ring[]): Ring[][] {
  let lo = Infinity, hi = -Infinity;
  const rings = poly.map((ring) => {
    const out: Ring = [];
    let shift = 0;
    ring.forEach(([x, y], i) => {
      if (i) {
        const d = x + shift - out[i - 1][0];
        if (d > 180) shift -= 360;
        else if (d < -180) shift += 360;
      }
      out.push([x + shift, y]);
      lo = Math.min(lo, x + shift);
      hi = Math.max(hi, x + shift);
    });
    return out;
  });
  if (hi <= 180 && lo >= -180) return [poly];
  const edge = hi > 180 ? 180 : -180;
  const part = (keepBelow: boolean, by: number) => rings.map((r) => clipX(r, edge, keepBelow)).filter((r) => r.length >= 3).map((r) => r.map(([x, y]) => [x + by, y] as [number, number]));
  return [part(edge === 180, 0), part(edge !== 180, edge === 180 ? -360 : 360)].filter((p) => p.length);
}

export class MapSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }

  /** Its outlines are drawn even when no data falls on them. */
  override drawsWithoutPoints(): boolean {
    return !!(this.options as MapSeriesOptions).features?.length;
  }

  override render(ctx: SeriesRenderContext): void {
    const { renderer, plot } = ctx;
    const g = renderer.group({ class: `facet-series facet-map ${this.name}` }, renderer.root);
    const o = this.options as typeof this.options & MapSeriesOptions;
    const planar = o.projection === 'planar';
    // Plane coordinates, y down.
    const sphere = o.projection === 'mercator' ? mercator : equalEarth;
    const project = (x: number, y: number): [number, number] => {
      if (planar) return [x, y];
      const [px, py] = sphere(x, y);
      return [px, -py];
    };

    // Outlines in degrees are cut at the 180th meridian first.
    const placed = this.points.filter((p) => Number.isFinite(p.options.lon) && Number.isFinite(p.options.lat));
    // The middle longitude: everything is turned so it's at 0 (and the cut
    // at the back of the globe moves with it).
    const areaLons = () => (o.features ?? []).flatMap((f) => (f.geometry ? polygons(f.geometry).flatMap((poly) => poly[0]?.filter((_, i) => i % 8 === 0).map(([x]) => x) ?? []) : []));
    const center = planar
      ? 0
      : typeof o.center === 'number'
        ? o.center
        : o.center === 'auto' || o.fit === 'data'
          ? middleLongitude(placed.length ? placed.map((p) => p.options.lon as number) : o.center === 'auto' ? areaLons() : [])
          : 0;
    const turn = (lon: number) => (center ? wrap(lon - center) : lon);
    const turned = (rings: Ring[]) => (center ? rings.map((ring) => ring.map(([x, y]) => [x - center, y] as [number, number])) : rings);
    const cut = (polys: Ring[][]) => (planar ? polys : polys.map(turned).flatMap(splitAntimeridian));
    const shapes = (o.features ?? []).flatMap((f) => (f.geometry ? [{ f, polys: cut(polygons(f.geometry)).map((poly) => poly.map((ring) => ring.map(([x, y]) => project(x, y)))) }] : []));
    const dots = placed.map((p) => ({ p, at: project(turn(p.options.lon as number), p.options.lat as number) }));

    // Fit everything drawn to the plot, keeping its shape.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = ([x, y]: [number, number]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    const toData = o.fit === 'data' && dots.length > 0;
    if (toData) {
      dots.forEach((d) => grow(d.at));
      // A margin around the dots, and at least the narrowest span.
      const unit = planar ? 1 : sphere(1, 0)[0];
      const least = (o.minSpan ?? 12) * unit;
      const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
      const half = (span: number) => Math.max(span * 1.25, least) / 2;
      const [hw, hh] = [half(maxX - minX), half(maxY - minY)];
      [minX, maxX, minY, maxY] = [cx - hw, cx + hw, cy - hh, cy + hh];
    } else {
      for (const s of shapes) for (const poly of s.polys) for (const ring of poly) ring.forEach(grow);
      dots.forEach((d) => grow(d.at));
    }
    if (!Number.isFinite(minX)) return;
    const w = maxX - minX || 1, h = maxY - minY || 1;
    // Room for the largest dot at the edge of the frame.
    const pad = toData ? 6 + Math.max(...dots.map((d) => Number(d.p.options.radius ?? 4))) : 4;
    const scale = Math.min((plot.width - 2 * pad) / w, (plot.height - 2 * pad) / h);
    const ox = (plot.width - w * scale) / 2 - minX * scale;
    const oy = (plot.height - h * scale) / 2 - minY * scale;
    // Drawn in a frame the size of the plot, which cuts off what's outside it.
    const frame = renderer.create('svg', { x: plot.x, y: plot.y, width: plot.width, height: plot.height, overflow: 'hidden', class: 'facet-map-frame' }, g) as unknown as SVGGElement;
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
      }, frame);
      if (p) wire(el, p);
    }

    for (const { p, at } of dots) {
      const [x, y] = place(at);
      const el = renderer.create('circle', {
        cx: x, cy: y, r: (p.options.radius as number | undefined) ?? 4,
        fill: p.color ?? this.color, 'fill-opacity': 0.75,
        stroke: '#ffffff', 'stroke-width': 0.8, class: 'facet-point facet-map-dot',
      }, frame);
      wire(el, p);
    }
  }
}
