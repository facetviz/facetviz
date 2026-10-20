import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacetViz } from "../src/index.js";
import "../src/entries/series/map.js";
import { equalEarth, middleLongitude, splitAntimeridian } from "../src/series/map.js";

function container(): HTMLElement {
  const element = document.createElement("div");
  element.style.width = "600px";
  element.style.height = "400px";
  document.body.appendChild(element);
  return element;
}

const square = (x: number, y: number, s: number) => ({ type: "Polygon" as const, coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] });

describe("Map series", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("projects with Equal Earth: the equator flat, the poles at the top and bottom", () => {
    expect(equalEarth(0, 0)).toEqual([0, 0]);
    const [x180] = equalEarth(180, 0);
    expect(x180).toBeCloseTo(2.7063, 3);
    const [, yPole] = equalEarth(0, 90);
    expect(yPole).toBeCloseTo(1.3173, 3);
    expect(equalEarth(-30, -20)[0]).toBeLessThan(0);
  });

  it("fills an area by its data point, draws the rest empty, and dots by longitude and latitude", () => {
    const element = container();
    const clicked = vi.fn();
    new FacetViz(element, {
      chart: { type: "map", width: 600, height: 400 },
      legend: { enabled: false },
      seriesEvents: { click: (e) => clicked(e.point) },
      series: [
        {
          type: "map",
          name: "Revenue",
          emptyColor: "#eeeeee",
          features: [
            { id: "A", name: "Alpha", geometry: square(0, 0, 10) },
            { id: "B", name: "Beta", geometry: square(20, 0, 10) },
          ],
          data: [
            { key: "A", color: "#ff0000", y: 5 },
            { lon: 25, lat: 5, radius: 6, color: "#0000ff", name: "Dot" },
          ],
        } as never,
      ],
    });
    const areas = element.querySelectorAll("path.facet-map-area");
    expect(areas).toHaveLength(2);
    expect(areas[0].getAttribute("fill")).toBe("#ff0000");
    expect(areas[1].getAttribute("fill")).toBe("#eeeeee");
    expect(areas[1].classList.contains("facet-map-empty")).toBe(true);
    const dot = element.querySelector("circle.facet-map-dot")!;
    expect(dot.getAttribute("r")).toBe("6");
    // The dot sits inside Beta's square, which is right of Alpha's.
    const xs = (d: string) => [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(Number(dot.getAttribute("cx"))).toBeGreaterThan(Math.min(...xs(areas[1].getAttribute("d")!)));
    expect(Math.max(...xs(areas[0].getAttribute("d")!))).toBeLessThan(Math.min(...xs(areas[1].getAttribute("d")!)));
    areas[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toHaveBeenCalled();
  });

  it("takes already projected outlines as they are with projection planar", () => {
    const element = container();
    new FacetViz(element, {
      chart: { type: "map", width: 600, height: 400 },
      legend: { enabled: false },
      series: [{ type: "map", projection: "planar", features: [{ id: "S", geometry: square(100, 100, 50) }], data: [{ key: "S", color: "#00ff00" }] } as never],
    });
    const area = element.querySelector("path.facet-map-area")!;
    expect(area.getAttribute("fill")).toBe("#00ff00");
    // Fitted to the plot: its corners well apart, not at the raw 100–150.
    const xs = [...area.getAttribute("d")!.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
  });
});

describe("Map fitted to its dots", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  const world = [
    { id: "a", geometry: square(-170, -60, 20) },
    { id: "b", geometry: square(150, 50, 20) },
  ];
  const draw = (fit: "all" | "data", data: { lon: number; lat: number; radius?: number }[], minSpan?: number) => {
    const element = container();
    new FacetViz(element, {
      chart: { type: "map", width: 600, height: 400, animation: false },
      legend: { enabled: false },
      series: [{ type: "map", name: "Stores", features: world, fit, ...(minSpan ? { minSpan } : {}), data }],
    });
    return element;
  };
  const centers = (el: HTMLElement) => [...el.querySelectorAll("circle.facet-map-dot")].map((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);

  it("spreads two close dots across the frame, instead of a speck on the world", () => {
    const pts = [{ lon: 72.8, lat: 19.0 }, { lon: 77.2, lat: 28.6 }];
    const [a1, b1] = centers(draw("all", pts));
    const [a2, b2] = centers(draw("data", pts));
    const apart = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    expect(apart(a2, b2)).toBeGreaterThan(apart(a1, b1) * 5);
    // Inside the frame, which cuts off the outlines beyond it.
    const frame = document.querySelectorAll("svg.facet-map-frame")[1];
    const w = Number(frame.getAttribute("width")), h = Number(frame.getAttribute("height"));
    for (const [x, y] of [a2, b2]) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(w);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(h);
    }
  });

  it("shows at least the narrowest span around one dot", () => {
    const one = (span?: number) => {
      document.body.innerHTML = "";
      const el = draw("data", [{ lon: 2.35, lat: 48.85 }], span);
      return el.querySelectorAll("path.facet-map-area")[0].getAttribute("d")!;
    };
    // A wider span shows the same outline smaller.
    const size = (d: string) => {
      const xs = [...d.matchAll(/[ML](-?[\d.]+),/g)].map((m) => Number(m[1]));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(size(one(10))).toBeGreaterThan(size(one(40)) * 3);
  });
});

describe("map centre", () => {
  it("takes the middle of longitudes the short way round", () => {
    expect(middleLongitude([72.8, 77.2, 88.3])).toBeCloseTo(80.55, 2);
    expect(middleLongitude([178.4, 174.8, -175])).toBeCloseTo(179.9, 1);
    expect(middleLongitude([-124, -67])).toBeCloseTo(-95.5, 2);
    expect(middleLongitude([])).toBe(0);
  });
  it("draws an area far from 0° square on when centred on it", () => {
    document.body.innerHTML = "";
    const skew = (center?: number | "auto") => {
      const el = container();
      new FacetViz(el, {
        chart: { type: "map", width: 600, height: 400, animation: false },
        legend: { enabled: false },
        series: [{ type: "map", name: "x", features: [{ id: "a", geometry: square(-110, 30, 10) }], ...(center != null ? { center } : {}), data: [{ key: "a", y: 1 }] }],
      });
      // The x of the bottom-left and top-left corners: equal when not skewed.
      const pts = [...el.querySelectorAll("path.facet-map-area")].pop()!.getAttribute("d")!.match(/-?[\d.]+,-?[\d.]+/g)!.map((p) => p.split(",").map(Number));
      return Math.abs(pts[0][0] - pts[3][0]);
    };
    expect(skew()).toBeGreaterThan(5);
    expect(skew(-105)).toBeLessThan(skew() / 4);
    expect(skew("auto" as never)).toBeLessThan(skew() / 4);
  });
});

describe("antimeridian", () => {
  it("cuts a polygon crossing 180° in two, each inside ±180", () => {
    const parts = splitAntimeridian([[[170, 60], [-170, 60], [-170, 70], [170, 70], [170, 60]]]);
    expect(parts).toHaveLength(2);
    for (const p of parts) for (const [x] of p[0]) expect(Math.abs(x)).toBeLessThanOrEqual(180);
    const xs = parts.map((p) => p[0].map(([x]) => x));
    expect(xs.some((x) => x.includes(170) && x.every((v) => v >= 170))).toBe(true);
    expect(xs.some((x) => x.includes(-170) && x.every((v) => v <= -170))).toBe(true);
  });
  it("leaves other polygons alone", () => {
    const poly: [number, number][][] = [[[0, 0], [10, 0], [10, 10], [0, 0]]];
    expect(splitAntimeridian(poly)).toEqual([poly]);
  });
});
