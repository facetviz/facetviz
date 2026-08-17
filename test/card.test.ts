import { beforeEach, describe, expect, it } from "vitest";
import { FacetCard } from "../src/index.js";

function container(): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: 360, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: 220, configurable: true });
  document.body.appendChild(element);
  return element;
}

describe("FacetCard", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("renders a formatted measure with a title", () => {
    const element = container();
    new FacetCard(element, {
      title: "Revenue",
      value: 1_284_000,
      format: "$,.1s",
    });

    expect(element.querySelector(".facet-card-title")?.textContent).toBe("Revenue");
    expect(element.querySelector(".facet-card-value")?.textContent).toBe("$1.3M");
    expect(element.querySelector(".facet-card")?.getAttribute("aria-label"))
      .toContain("Revenue, $1.3M");
  });

  it("derives absolute and percentage change from a previous value", () => {
    const element = container();
    new FacetCard(element, {
      title: "Orders",
      value: 120,
      format: ",.0f",
      comparison: {
        previousValue: 100,
        display: "both",
        label: "vs last month",
      },
    });

    const comparison = element.querySelector(".facet-card-comparison");
    expect(comparison?.classList.contains("facet-card-comparison-positive")).toBe(true);
    expect(comparison?.getAttribute("data-direction")).toBe("up");
    expect(comparison?.textContent).toContain("+20 (+20.0%)");
    expect(comparison?.textContent).toContain("vs last month");
  });

  it("treats a decrease as positive when lower is favorable", () => {
    const element = container();
    new FacetCard(element, {
      title: "Response time",
      value: 80,
      comparison: { previousValue: 100, favorableDirection: "decrease" },
    });

    const comparison = element.querySelector(".facet-card-comparison");
    expect(comparison?.classList.contains("facet-card-comparison-positive")).toBe(true);
    expect(comparison?.getAttribute("data-direction")).toBe("down");
    expect(comparison?.textContent).toContain("−20.0%");
  });

  it("embeds any registered chart with compact defaults", () => {
    const element = container();
    new FacetCard(element, {
      title: "Active users",
      value: 8421,
      chart: {
        chart: { type: "sparkline" },
        series: [{ data: [12, 15, 14, 19, 23, 21] }],
      },
    });

    expect(element.querySelectorAll(".facet-card-chart svg")).toHaveLength(1);
    expect(element.querySelector(".facet-sparkline path")).toBeTruthy();
    expect(element.querySelector(".facet-axis-left")).toBeNull();
  });

  it("renders progress-to-target and contribution breakdown cards", () => {
    const element = container();
    new FacetCard(element, {
      title: "Quarterly revenue",
      value: 742_000,
      format: "$,.0s",
      progress: { target: 1_000_000, label: "74% achieved" },
      breakdown: {
        items: [
          { label: "Direct", value: 620_000 },
          { label: "Partner", value: 410_000 },
          { label: "Online", value: 254_000 },
        ],
      },
    });

    expect(element.querySelector<HTMLElement>(".facet-card-progress-value")?.style.width)
      .toBe("74.2%");
    expect(element.querySelector(".facet-card-progress-labels")?.textContent)
      .toContain("Target $1M");
    expect(element.querySelectorAll(".facet-card-breakdown-item")).toHaveLength(3);
  });

  it("supports split period comparisons and radial goals", () => {
    const splitHost = container();
    new FacetCard(splitHost, {
      title: "New customers",
      value: 1842,
      format: ",.0f",
      comparison: {
        previousValue: 1623,
        layout: "split",
        currentLabel: "This month",
        previousLabel: "Last month",
      },
    });
    expect(splitHost.querySelector(".facet-card-comparison-split")?.textContent)
      .toContain("This month1,842Last month1,623↗ +13.5%");

    const goalHost = container();
    new FacetCard(goalHost, {
      title: "Resolution SLA",
      value: 648,
      goal: { target: 800 },
    });
    expect(goalHost.querySelector(".facet-card-goal-ring")?.getAttribute("aria-label"))
      .toBe("81% of goal");
    expect(goalHost.querySelector(".facet-card-goal-label")?.textContent).toBe("of 800");
  });

  it("renders threshold, min/max context, and operational summary blocks", () => {
    const element = container();
    new FacetCard(element, {
      title: "API latency",
      value: 184,
      format: ",.0fms",
      status: { text: "Healthy", detail: "within threshold", tone: "positive" },
      range: { min: 0, max: 500, target: 300, minLabel: "Fast", maxLabel: "Slow" },
      context: { min: 120, average: 176, max: 240, message: "Within weekly range" },
      summary: {
        items: [
          { label: "API", value: "Healthy", tone: "positive" },
          { label: "Workers", value: "2 warnings", tone: "warning" },
          { label: "Database", value: "Healthy", tone: "positive" },
        ],
      },
    });

    expect(element.querySelector(".facet-card-status")?.textContent)
      .toBe("Healthywithin threshold");
    expect(element.querySelector<HTMLElement>(".facet-card-range-marker")?.style.left)
      .toBe("36.8%");
    expect(element.querySelector(".facet-card-context-values")?.textContent)
      .toContain("Average176ms");
    expect(element.querySelectorAll(".facet-card-summary-item")).toHaveLength(3);
  });

  it("builds a forecast chart with a confidence range", () => {
    const element = container();
    new FacetCard(element, {
      title: "Month-end revenue",
      value: 1_420_000,
      forecast: {
        label: "Forecast",
        rangeLabel: "$1.31M–$1.53M",
        data: [["W1", 1.1], ["W2", 1.25], ["W3", 1.42]],
        range: [["W1", 1.0, 1.2], ["W2", 1.1, 1.4], ["W3", 1.31, 1.53]],
      },
    });

    expect(element.querySelector(".facet-card-forecast-label")?.textContent).toBe("Forecast");
    expect(element.querySelector(".facet-arearange")).toBeTruthy();
    expect(element.querySelector(".facet-line")).toBeTruthy();
    expect(element.querySelector(".facet-card-forecast-range")?.textContent)
      .toBe("$1.31M–$1.53M");
  });

  it("updates values and replaces optional visuals without duplicating them", () => {
    const element = container();
    const card = new FacetCard(element, {
      value: 10,
      chart: { series: [{ type: "sparkline", data: [8, 9, 10] }] },
    });
    card.setValue(12);
    expect(element.querySelector(".facet-card-value")?.textContent).toBe("12");
    expect(element.querySelectorAll(".facet-card-chart svg")).toHaveLength(1);

    card.update({ chart: false, comparison: { previousValue: 10 } });
    expect(element.querySelector(".facet-card-chart")).toBeNull();
    expect(element.querySelector(".facet-card-comparison")?.textContent).toContain("+20.0%");
  });

  it("removes its DOM and embedded chart on destroy", () => {
    const element = container();
    const card = new FacetCard(element, {
      value: "Healthy",
      chart: { series: [{ type: "sparkline", data: [1, 2, 3] }] },
    });
    card.destroy();
    expect(element.children).toHaveLength(0);
  });
});
