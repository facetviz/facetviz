import { beforeEach, describe, expect, it } from "vitest";
import { FacetViz } from "../src/index.js";
import { roundedSectorPath } from "../src/series/polar.js";

function container(width = 400, height = 400): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(element);
  return element;
}

const chart = { width: 400, height: 400, animation: false, reflow: false };
/** Corner arcs: those whose radius is the corner's, not a ring's. */
const cornerArcs = (d: string, r: number) =>
  (d.match(/A ([\d.]+) /g) ?? []).filter((a) => Math.abs(parseFloat(a.slice(2)) - r) < 1e-6).length;
/** Every coordinate pair of a path, to check none strays off its ring. */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of d.matchAll(/(?:[ML]|A [\d.]+ [\d.]+ 0 [01] [01]) (-?[\d.e-]+) (-?[\d.e-]+)/g)) out.push([+m[1], +m[2]]);
  return out;
}

describe("rounded pie, donut, radial bar, sunburst and rose corners", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rounds a ring piece's four corners and keeps every point between its radii", () => {
    const d = roundedSectorPath(0, 0, 50, 100, 0, Math.PI / 2, 8)!;
    expect(cornerArcs(d, 8)).toBe(4);
    for (const [x, y] of points(d)) {
      const r = Math.hypot(x, y);
      expect(r).toBeGreaterThan(50 - 1e-6);
      expect(r).toBeLessThan(100 + 1e-6);
    }
  });

  it("rounds a wedge's two outer corners and leaves its centre point sharp", () => {
    const d = roundedSectorPath(0, 0, 0, 100, 0, Math.PI / 3, 8)!;
    expect(cornerArcs(d, 8)).toBe(2);
    expect(d).toContain("L 0 0");
  });

  it("shrinks the corners to fit a thin or narrow piece, and draws nothing for a full turn", () => {
    // 10 px thick: corners at most 5.
    expect(cornerArcs(roundedSectorPath(0, 0, 90, 100, 0, 1, 20)!, 5)).toBe(4);
    // A sliver keeps its angle: no corner wider than the piece.
    const sliver = roundedSectorPath(0, 0, 0, 100, 0, 0.02, 20)!;
    const r = parseFloat(sliver.match(/A ([\d.]+) /)![1]);
    expect(r).toBeLessThan(1.1);
    expect(roundedSectorPath(0, 0, 50, 100, 0, Math.PI * 2, 8)).toBeUndefined();
  });

  it("draws rounded slices for a pie, donut, radial bar, sunburst and rose with borderRadius", () => {
    const shapes = (selector: string, options: object) => {
      const element = container();
      new FacetViz(element, options as never);
      const ds = [...element.querySelectorAll(selector)].map((el) => el.getAttribute("d") ?? "");
      element.remove();
      return ds;
    };
    const pie = shapes(".facet-point", {
      chart: { type: "pie", ...chart },
      series: [{ name: "S", borderRadius: 6, data: [{ name: "a", y: 3 }, { name: "b", y: 2 }] }],
    });
    expect(pie.every((d) => cornerArcs(d, 6) === 2)).toBe(true);
    const donut = shapes(".facet-point", {
      chart: { type: "pie", ...chart },
      series: [{ name: "S", innerSize: "50%", borderRadius: 6, data: [{ name: "a", y: 3 }, { name: "b", y: 2 }] }],
    });
    expect(donut.every((d) => cornerArcs(d, 6) === 4)).toBe(true);
    const radial = shapes(".facet-radialbar .facet-point", {
      chart: { type: "radialbar", ...chart },
      series: [{ name: "S", borderRadius: 4, data: [{ name: "a", y: 3 }, { name: "b", y: 2 }] }],
    });
    expect(radial.length).toBe(2);
    expect(radial.every((d) => cornerArcs(d, 4) === 4)).toBe(true);
    const sunburst = shapes(".facet-sunburst .facet-point", {
      chart: { type: "sunburst", ...chart },
      series: [{ name: "S", borderRadius: 4, data: [{ id: "w", name: "W" }, { id: "w1", parent: "w", name: "x", value: 2 }, { id: "e", name: "E", value: 3 }] }],
    });
    expect(sunburst.every((d) => cornerArcs(d, 4) >= 2)).toBe(true);
    const rose = shapes(".facet-polar-sector", {
      chart: { type: "column", polar: true, ...chart },
      xAxis: { categories: ["a", "b", "c"] },
      series: [{ name: "S", borderRadius: 4, data: [3, 2, 4] }],
    });
    expect(rose.length).toBe(3);
    expect(rose.every((d) => cornerArcs(d, 4) >= 2)).toBe(true);
  });

  it("keeps square corners without borderRadius", () => {
    const element = container();
    new FacetViz(element, {
      chart: { type: "pie", ...chart },
      series: [{ name: "S", data: [{ name: "a", y: 3 }, { name: "b", y: 2 }] }],
    });
    const d = element.querySelector(".facet-point")!.getAttribute("d")!;
    expect(d.startsWith("M ")).toBe(true);
    expect(d.match(/A /g)!.length).toBe(1);
  });
});
