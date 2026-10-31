import { beforeEach, describe, expect, it } from "vitest";
import { FacetViz } from "../src/index.js";

function container(width = 400, height = 400): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  document.body.appendChild(element);
  return element;
}

describe("sunburst", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("names each piece only as far as it fits: cut with …, or left out", () => {
    const element = container();
    new FacetViz(element, {
      chart: { type: "sunburst", width: 400, height: 400, animation: false, reflow: false },
      series: [
        {
          name: "Revenue",
          data: [
            { id: "w", name: "West" },
            { id: "w1", parent: "w", name: "Office Supplies and Stationery", value: 30 },
            { id: "w2", parent: "w", name: "Furniture", value: 3 },
            { id: "w3", parent: "w", name: "Technology", value: 1 },
            { id: "e", name: "East", value: 40 },
          ],
        },
      ],
    });
    const names = [...element.querySelectorAll(".facet-sunburst text")].map((t) => t.textContent ?? "");
    expect(names).toContain("West");
    expect(names).toContain("East");
    // A roomy piece has its whole name, a small one a cut name, the
    // smallest none.
    expect(names).toContain("Office Supplies and Stationery");
    expect(names).toContain("Fur…");
    expect(names.some((n) => n.startsWith("Tech"))).toBe(false);
  });
});
