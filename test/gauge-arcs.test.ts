import { beforeEach, describe, expect, it } from "vitest";
import { FacetViz } from "../src/index.js";

function container(width = 320, height = 240): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(element);
  return element;
}

function gauge(startAngle: number, endAngle: number, extra: object = {}): HTMLElement {
  const element = container();
  new FacetViz(element, {
    chart: { type: "gauge", width: 320, height: 240, animation: false, reflow: false },
    series: [{ name: "Revenue", data: [{ y: 62, name: "Revenue" }], min: 0, max: 100, startAngle, endAngle, ...extra }],
  } as never);
  return element;
}

/** Every coordinate of a path's moves, lines and arcs. */
function coords(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of d.matchAll(/(?:[ML]|A [\d.]+ [\d.]+ 0 [01] [01]) (-?[\d.e-]+) (-?[\d.e-]+)/g)) out.push([+m[1], +m[2]]);
  return out;
}

describe("gauge arcs other than a half circle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fits a three-quarter dial in its box, end labels under its ends, the value at the centre", () => {
    const el = gauge(135, 405);
    const track = el.querySelector(".facet-gauge-item path")!.getAttribute("d")!;
    for (const [x, y] of coords(track)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(320);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(240);
    }
    const texts = [...el.querySelectorAll(".facet-gauge-item text")].map((t) => t.textContent);
    expect(texts).toContain("0");
    expect(texts).toContain("100");
    // The ends sit below the centre: their labels below the value.
    const y = (t: string) => Number([...el.querySelectorAll(".facet-gauge-item text")].find((n) => n.textContent === t)!.getAttribute("y"));
    expect(y("0")).toBeGreaterThan(y("62"));
  });

  it("keeps the half circle exactly where it was", () => {
    const half = gauge(180, 360).querySelector(".facet-gauge-item path")!.getAttribute("d");
    document.body.innerHTML = "";
    const element = container();
    new FacetViz(element, {
      chart: { type: "gauge", width: 320, height: 240, animation: false, reflow: false },
      series: [{ name: "Revenue", data: [{ y: 62, name: "Revenue" }], min: 0, max: 100 }],
    } as never);
    expect(element.querySelector(".facet-gauge-item path")!.getAttribute("d")).toBe(half);
  });

  it("outlines a full circle's value with a needle, which may cross it", () => {
    const value = gauge(270, 630, { needle: true }).querySelector(".facet-gauge-value")!;
    expect(value.getAttribute("paint-order")).toBe("stroke");
    document.body.innerHTML = "";
    expect(gauge(180, 360, { needle: true }).querySelector(".facet-gauge-value")!.getAttribute("paint-order")).toBeNull();
  });
});
