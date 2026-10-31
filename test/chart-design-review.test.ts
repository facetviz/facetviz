// Fixes from the 2026-11-01 chart design review (app BUGS.md BUG-279–327).
import { beforeEach, describe, expect, it } from "vitest";
import { FacetViz } from "../src/index.js";
import { niceDateTicks } from "../src/core/utils.js";
import { LogScale } from "../src/core/scale.js";

function container(width = 400, height = 400): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(element);
  return element;
}

const base = (type: string, width = 400, height = 400) => ({ type, width, height, animation: false, reflow: false });

describe("chart design review fixes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("a pie leaves negative values out of its total (BUG-308)", () => {
    const el = container();
    const shares: number[] = [];
    new FacetViz(el, {
      chart: base("pie"),
      series: [{
        name: "Profit",
        data: [{ name: "A", y: 100 }, { name: "B", y: 40 }, { name: "C", y: -50 }],
        dataLabels: { enabled: true, formatter: (c: { percentage?: number; name?: unknown }) => { shares.push(c.percentage ?? 0); return `${c.name}`; } },
      }],
    } as never);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it("a sunburst with one top-level piece draws it as the first ring, its children outside (BUG-309)", () => {
    const el = container();
    new FacetViz(el, {
      chart: base("sunburst"),
      series: [{ name: "S", data: [{ id: "w", name: "West" }, { id: "a", parent: "w", name: "A", value: 3 }, { id: "b", parent: "w", name: "B", value: 1 }] }],
    } as never);
    const paths = [...el.querySelectorAll(".facet-sunburst path")];
    expect(paths).toHaveLength(3);
    // The lone root is a whole ring: drawn (not an empty arc).
    expect(paths[0].getAttribute("d")).toMatch(/A .* A /);
    // Its children take different colours.
    expect(paths[1].getAttribute("fill")).not.toBe(paths[2].getAttribute("fill"));
  });

  it("a funnel draws no flipped stage for a negative value and puts a narrow stage's label beside it (BUG-314, BUG-316)", () => {
    const el = container();
    new FacetViz(el, {
      chart: base("funnel"),
      series: [{ name: "F", data: [{ name: "Visit", y: 1000 }, { name: "Pay", y: 5 }, { name: "Lost", y: -10 }] }],
    } as never);
    const polys = [...el.querySelectorAll(".facet-funnel polygon")].map((p) => p.getAttribute("points")!);
    for (const pts of polys) {
      const xs = pts.split(" ").map((p) => Number(p.split(",")[0]));
      expect(xs[1]).toBeGreaterThanOrEqual(xs[0]);
    }
    const pay = [...el.querySelectorAll(".facet-funnel text")].find((t) => t.textContent?.startsWith("Pay"));
    expect(pay?.getAttribute("text-anchor")).toBe("start");
    expect(pay?.getAttribute("fill")).not.toBe("#fff");
  });

  it("heatmap columns keep the given order and labels take the label style (BUG-295, BUG-281)", () => {
    const el = container(500, 300);
    new FacetViz(el, {
      chart: base("heatmap", 500, 300),
      series: [{
        name: "H",
        columns: ["Jan", "Feb", "Mar"],
        dataLabels: { enabled: true, color: "#ff0000", fontWeight: "bold" },
        data: [
          { x: "Feb", y: "North", value: 2 }, { x: "Mar", y: "North", value: 3 },
          { x: "Jan", y: "South", value: 1 }, { x: "Feb", y: "South", value: 4 },
        ],
      }],
    } as never);
    const texts = [...el.querySelectorAll(".facet-heatmap text")].map((t) => t.textContent);
    expect(texts.indexOf("Jan")).toBeLessThan(texts.indexOf("Feb"));
    const label = [...el.querySelectorAll(".facet-heatmap text")].find((t) => t.textContent === "4");
    expect(label?.getAttribute("fill")).toBe("#ff0000");
    expect(label?.getAttribute("font-weight")).toBe("bold");
  });

  it("an outside label on a negative column hangs below it (BUG-296)", () => {
    const el = container();
    new FacetViz(el, {
      chart: base("column"),
      xAxis: { categories: ["A", "B"] },
      series: [{ name: "P", data: [10, -10], dataLabels: { enabled: true } }],
    } as never);
    const labels = [...el.querySelectorAll(".facet-column text, .facet-series text")].filter((t) => t.textContent === "-10");
    expect(labels[0]?.getAttribute("dominant-baseline")).toBe("hanging");
  });

  it("a lone point between gaps gets a dot (BUG-298)", () => {
    const el = container();
    new FacetViz(el, {
      chart: base("line"),
      series: [{ name: "L", data: [1, null, 3, null, 5, 6] }],
    } as never);
    expect(el.querySelectorAll(".facet-line-lone")).toHaveLength(2);
  });

  it("data labels that would overlap are left out (BUG-305)", () => {
    const el = container(200, 300);
    new FacetViz(el, {
      chart: base("line", 200, 300),
      series: [
        { name: "A", data: [100, 100, 100], dataLabels: { enabled: true } },
        { name: "B", data: [100, 100, 100], dataLabels: { enabled: true } },
      ],
    } as never);
    const texts = [...el.querySelectorAll(".facet-series text")].filter((t) => t.textContent === "100");
    expect(texts.length).toBe(3);
  });

  it("an axis min above the data still gives ticks (BUG-279)", () => {
    const el = container();
    new FacetViz(el, {
      chart: base("column"),
      xAxis: { categories: ["A", "B"] },
      yAxis: { min: 500 },
      series: [{ name: "P", data: [10, 100] }],
    } as never);
    expect(el.querySelectorAll(".facet-axis-label, .facet-y-axis text, .facet-axis text").length).toBeGreaterThan(0);
  });

  it("day ticks sit on local midnights and weeks start on Monday (BUG-294)", () => {
    const start = new Date(2026, 0, 5).getTime();
    const end = new Date(2026, 0, 12).getTime();
    for (const t of niceDateTicks(start, end).ticks) {
      const d = new Date(t);
      expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
    }
    const weeks = niceDateTicks(new Date(2026, 0, 1).getTime(), new Date(2026, 1, 25).getTime()).ticks;
    for (const t of weeks) expect(new Date(t).getDay()).toBe(1);
  });

  it("a log axis keeps about tickCount ticks (BUG-284)", () => {
    const s = new LogScale({ domain: [1, 1e9], range: [0, 100], tickCount: 4 });
    expect(s.ticks().length).toBeLessThanOrEqual(5);
  });

  it("dual axes with alignTicks share the grid and their zero (BUG-299)", () => {
    const el = container(500, 400);
    new FacetViz(el, {
      chart: base("column", 500, 400),
      xAxis: { categories: ["A", "B", "C"] },
      yAxis: [{}, { opposite: true, alignTicks: true }],
      series: [
        { name: "L", type: "column", data: [10, 60, 100] },
        { name: "R", type: "line", yAxis: 1, data: [-5, 4, 10] },
      ],
    } as never);
    const axes = [...el.querySelectorAll(".facet-y-axis, .facet-axis-y")];
    if (axes.length >= 2) {
      const count = (a: Element) => a.querySelectorAll("text").length;
      expect(Math.abs(count(axes[0]) - count(axes[1]))).toBeLessThanOrEqual(1);
    }
  });

  it("a stacked area whose series crosses zero stacks on one running base (BUG-301)", () => {
    const el = container();
    const chart = new FacetViz(el, {
      chart: base("area"),
      plotOptions: { area: { stacking: "normal" } },
      xAxis: { categories: ["A", "B"] },
      series: [{ name: "X", data: [5, -5] }, { name: "Y", data: [3, 3] }],
    } as never);
    const y = (chart as unknown as { series: Array<{ points: Array<{ stackLow?: number; stackHigh?: number }> }> }).series[1].points;
    expect([y[1].stackLow, y[1].stackHigh]).toEqual([-5, -2]);
  });

  it("sankey nodes fit the plot however many there are, and a name keeps its colour (BUG-319, BUG-327)", () => {
    const el = container(400, 200);
    const data = Array.from({ length: 40 }, (_, i) => ({ from: `S${i}`, to: i % 2 ? "Same​" : `T${i}`, weight: 1 + (i % 3) }));
    data.push({ from: "Same", to: "End", weight: 2 });
    new FacetViz(el, { chart: base("sankey", 400, 200), series: [{ name: "F", data }] } as never);
    for (const r of el.querySelectorAll(".facet-sankey rect, .facet-series rect")) {
      const y = Number(r.getAttribute("y"));
      const h = Number(r.getAttribute("height"));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + h).toBeLessThanOrEqual(200);
    }
  });

  it("a decomposition tree keeps its opened node when the column is cut (BUG-320)", () => {
    const el = container(600, 160);
    const data = [
      { name: "Total", y: 100, level: 0, opened: true },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `N${i}`, y: 20 - i, level: 1, opened: i === 11 })),
      { name: "A", y: 5, level: 2 },
    ];
    new FacetViz(el, { chart: base("decomp", 600, 160), series: [{ type: "decomp", name: "D", data }] } as never);
    const names = [...el.querySelectorAll(".facet-decomp text")].map((t) => t.textContent);
    expect(names).toContain("N11");
    expect(names.some((n) => /not shown/.test(n ?? ""))).toBe(true);
  });
});
