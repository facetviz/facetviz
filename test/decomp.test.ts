import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacetViz } from "../src/index.js";
import "../src/entries/series/decomp.js";
import { fitText } from "../src/series/decomp.js";

function container(): HTMLElement {
  const element = document.createElement("div");
  element.style.width = "800px";
  element.style.height = "400px";
  document.body.appendChild(element);
  return element;
}

describe("Decomposition tree series", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("draws a column per level, bars as long as their values, and curves from the opened node", () => {
    const element = container();
    const clicked = vi.fn();
    new FacetViz(element, {
      chart: { type: "decomp", width: 800, height: 400, animation: false },
      legend: { enabled: false },
      seriesEvents: { click: (e) => clicked(e.point) },
      series: [
        {
          type: "decomp",
          name: "Revenue",
          levels: ["Revenue", "region", "category"],
          data: [
            { name: "Total", y: 100, level: 0, opened: true, valueText: "100" },
            { name: "West", y: 60, level: 1, opened: true },
            { name: "East", y: 40, level: 1 },
            { name: "Tech", y: 45, level: 2 },
            { name: "Chairs", y: 15, level: 2 },
          ],
        },
      ],
    });
    const nodes = element.querySelectorAll(".facet-decomp-node");
    expect(nodes).toHaveLength(5);
    expect(element.querySelectorAll(".facet-decomp-open")).toHaveLength(2);
    // Two curves to the regions, two to the categories.
    expect(element.querySelectorAll(".facet-decomp-link")).toHaveLength(4);
    const texts = [...element.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(["Revenue", "region", "category", "Total", "100", "West", "60"]));
    // West's bar is longer than East's, both under the column's width.
    const bar = (i: number) => Number(nodes[i].querySelectorAll("rect")[1].getAttribute("width"));
    expect(bar(1)).toBeGreaterThan(bar(2));
    expect(bar(2) / bar(1)).toBeCloseTo(40 / 60, 1);
    nodes[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toHaveBeenCalledWith(expect.objectContaining({ name: "East" }));
  });

  it("draws nothing without nodes", () => {
    const element = container();
    new FacetViz(element, { chart: { type: "decomp", width: 400, height: 300 }, series: [{ type: "decomp", name: "x", data: [] }] });
    expect(element.querySelectorAll(".facet-decomp-node")).toHaveLength(0);
  });
  it("cuts a name short with an ellipsis to the room it has", () => {
    const measure = (t: string) => t.length * 6;
    expect(fitText("West", 60, measure)).toBe("West");
    expect(fitText("Office Supplies and Furniture", 60, measure)).toBe("Office Su…");
    expect(fitText("Office Supplies and Furniture", 60, measure).length * 6).toBeLessThanOrEqual(60);
    expect(fitText("Northwest", 5, measure)).toBe("");
    expect(fitText("Northwest", 6, measure)).toBe("…");
  });
});
