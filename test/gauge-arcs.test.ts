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

  it("outlines the value whenever a needle may cross it", () => {
    for (const [s, e] of [[180, 360], [135, 405], [270, 630]]) {
      document.body.innerHTML = "";
      expect(gauge(s, e, { needle: true }).querySelector(".facet-gauge-value")!.getAttribute("paint-order")).toBe("stroke");
    }
    document.body.innerHTML = "";
    expect(gauge(180, 360).querySelector(".facet-gauge-value")!.getAttribute("paint-order")).toBeNull();
  });

  it("writes the real value, marked past the dial's end (BUG-222)", () => {
    const el = gauge(180, 360, { data: [{ y: 130, name: "Revenue" }] });
    const value = el.querySelector(".facet-gauge-value")!;
    expect(value.textContent).toBe("130▲");
    document.body.innerHTML = "";
    expect(gauge(180, 360, { data: [{ y: -20, name: "Revenue" }] }).querySelector(".facet-gauge-value")!.textContent).toBe("-20▼");
  });

  it("puts a full circle's start label on the side it runs to (BUG-223)", () => {
    const el = gauge(270, 630);
    const x = (t: string) => Number([...el.querySelectorAll(".facet-gauge-end-label")].find((n) => n.textContent === t)!.getAttribute("x"));
    // Clockwise from 12 o'clock: low values are to the right of the top.
    expect(x("0")).toBeGreaterThan(x("100"));
  });

  it("keeps a rounded value band inside its value's angle (BUG-224)", () => {
    const el = gauge(180, 360, { roundedEnds: true, thickness: "50%" });
    const d = el.querySelector(".facet-gauge-value-band")!.getAttribute("d")!;
    const track = el.querySelector(".facet-gauge-track")!.getAttribute("d")!;
    // The centre: the track's start and end are symmetric round it.
    const pts = coords(track);
    const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
    const cy = Math.max(...pts.map((p) => p[1]));
    const end = 180 + 180 * 0.62;
    for (const [x, y] of coords(d)) {
      let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
      if (deg < 90) deg += 360;
      expect(deg).toBeLessThanOrEqual(end + 0.01);
      expect(y).toBeLessThanOrEqual(cy + 0.01);
    }
  });

  it("fits marker labels inside the chart and apart (BUG-228, BUG-229)", () => {
    for (const [s, e] of [[180, 360], [135, 405], [270, 630]]) {
      document.body.innerHTML = "";
      const el = gauge(s, e, { markers: [{ value: 60, label: "Q3 plan" }, { value: 64, label: "Q4 stretch target" }, { value: 90, label: "Target: 90" }, { value: 100, label: "100" }] });
      const labels = [...el.querySelectorAll(".facet-gauge-marker-label")].map((n) => n.textContent);
      // The one repeating the end label is left out.
      expect(labels).not.toContain("100");
      expect(labels).toContain("Target: 90");
    }
  });

  it("moves a name that would cross the band under the dial", () => {
    const el = gauge(180, 360, { data: [{ y: 62, name: "A rather long division name" }], thickness: "40%" });
    const name = Number(el.querySelector(".facet-gauge-label")!.getAttribute("y"));
    const ends = [...el.querySelectorAll(".facet-gauge-end-label")].map((n) => Number(n.getAttribute("y")));
    expect(name).toBeGreaterThan(Math.max(...ends));
  });

  it("takes an opacity for the value band, needle, markers and track", () => {
    const el = gauge(180, 360, { valueOpacity: 0.5, trackOpacity: 0.8, valueBand: true, needle: { opacity: 0.4 }, markers: [{ value: 90, label: "Target", opacity: 0.6 }] });
    expect(el.querySelector(".facet-gauge-value-band")!.getAttribute("opacity")).toBe("0.5");
    expect(el.querySelector(".facet-gauge-track")!.getAttribute("opacity")).toBe("0.8");
    expect(el.querySelector(".facet-gauge-needle")!.getAttribute("opacity")).toBe("0.4");
    expect(el.querySelector(".facet-gauge-marker")!.getAttribute("opacity")).toBe("0.6");
    expect(el.querySelector(".facet-gauge-marker-label")!.getAttribute("opacity")).toBe("0.6");
    document.body.innerHTML = "";
    // Unset: fully opaque, no attribute.
    expect(gauge(180, 360).querySelector(".facet-gauge-value-band")!.getAttribute("opacity")).toBeNull();
  });
});
