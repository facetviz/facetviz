import { beforeEach, describe, expect, it } from "vitest";
import { FacetViz, validateChartOptions } from "../src/index.js";

function container(width = 600, height = 400): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(element, "clientHeight", {
    value: height,
    configurable: true,
  });
  document.body.appendChild(element);
  return element;
}

const chart = {
  width: 600,
  height: 400,
  animation: false,
  reflow: false,
} as const;

describe("layout, annotations, responsive rules, and polar projection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("can disable chart and axis titles and align an enabled axis title", () => {
    const element = container();
    new FacetViz(element, {
      chart,
      title: { text: "Hidden chart title", enabled: false },
      xAxis: {
        categories: ["A", "B"],
        title: { text: "Hidden axis title", enabled: false },
      },
      yAxis: {
        title: {
          text: "Value",
          align: "start",
          margin: 18,
          offset: 3,
        },
      },
      series: [{ data: [2, 4] }],
    });

    const texts = [...element.querySelectorAll("text")];
    expect(texts.some((node) => node.textContent === "Hidden chart title")).toBe(false);
    expect(texts.some((node) => node.textContent === "Hidden axis title")).toBe(false);
    const valueTitle = texts.find((node) => node.textContent === "Value");
    expect(valueTitle?.getAttribute("text-anchor")).toBe("start");
  });

  it("measures, rotates, thins, and truncates crowded category labels", () => {
    const element = container(230, 220);
    new FacetViz(element, {
      chart: { ...chart, width: 230, height: 220 },
      xAxis: {
        categories: [
          "January revenue",
          "February revenue",
          "March revenue",
          "April revenue",
        ],
        labels: {
          autoRotation: [0, -45],
          maxWidth: 34,
        },
      },
      series: [{ data: [2, 4, 3, 5] }],
    });

    const labels = [
      ...element.querySelectorAll<SVGTextElement>(".facet-axis-bottom text"),
    ];
    expect(labels.length).toBeLessThanOrEqual(4);
    expect(labels.some((node) => node.textContent?.endsWith("…"))).toBe(true);
    expect(labels.some((node) => node.getAttribute("transform")?.includes("-45"))).toBe(true);
  });

  it("renders value-anchored callouts above the series", () => {
    const element = container();
    new FacetViz(element, {
      chart: { ...chart, type: "line" },
      xAxis: { categories: ["Jan", "Feb", "Mar"] },
      annotations: [
        {
          x: "Feb",
          y: 8,
          text: "Campaign launched",
          shape: "callout",
          dx: 20,
          dy: -22,
        },
      ],
      series: [{ marker: { enabled: true }, data: [3, 8, 6] }],
    });

    expect(element.querySelector(".facet-annotation-connector")).toBeTruthy();
    expect(element.querySelector(".facet-annotation-label")?.textContent).toBe(
      "Campaign launched",
    );
    const annotation = element.querySelector(".facet-annotations-above");
    const series = element.querySelector(".facet-series");
    expect(
      annotation && series
        ? Boolean(series.compareDocumentPosition(annotation) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false,
    ).toBe(true);
  });

  it("deep-merges matching responsive rules for one render", () => {
    const element = container(320, 240);
    const instance = new FacetViz(element, {
      chart: { width: 320, height: 240, animation: false, reflow: false },
      xAxis: { categories: ["A", "B"] },
      legend: { enabled: true },
      responsive: [
        {
          condition: { maxWidth: 400 },
          options: {
            legend: { enabled: false },
            xAxis: { labels: { enabled: false } },
          },
        },
      ],
      series: [
        { name: "One", data: [1, 2] },
        { name: "Two", data: [2, 3] },
      ],
    });

    expect(element.querySelector(".facet-legend")).toBeFalsy();
    expect(element.querySelectorAll(".facet-axis-bottom text")).toHaveLength(0);
    expect(instance.options.legend?.enabled).toBe(true);
    expect(
      Array.isArray(instance.options.xAxis)
        ? undefined
        : instance.options.xAxis?.labels?.enabled,
    ).toBeUndefined();
  });

  it("projects line and column series into a shared polar frame", () => {
    const lineElement = container();
    new FacetViz(lineElement, {
      chart: { ...chart, type: "line", polar: true },
      xAxis: { categories: ["N", "E", "S", "W"] },
      series: [{ marker: { enabled: true }, data: [4, 7, 5, 8] }],
    });
    const linePath = lineElement
      .querySelector<SVGPathElement>(".facet-line path")
      ?.getAttribute("d");
    expect(lineElement.querySelectorAll(".facet-polar-spoke")).toHaveLength(4);
    expect(linePath).toContain("L");
    expect(linePath).not.toContain("NaN");

    const columnElement = container();
    new FacetViz(columnElement, {
      chart: { ...chart, type: "column", polar: true },
      xAxis: {
        categories: ["N", "E", "S", "W"],
        title: { text: "Direction", position: "center" },
      },
      series: [{ data: [4, 7, 5, 8] }],
    });
    expect(columnElement.querySelectorAll(".facet-polar-sector")).toHaveLength(4);
    expect(
      columnElement
        .querySelector(".facet-polar-sector")
        ?.getAttribute("d"),
    ).toContain("A");

    const mixedElement = container();
    new FacetViz(mixedElement, {
      chart: { ...chart, type: "area", polar: true },
      xAxis: { categories: ["N", "E", "S", "W"] },
      series: [
        { name: "Area", data: [3, 5, 4, 6] },
        {
          name: "Samples",
          type: "scatter",
          marker: { enabled: true },
          data: [2, 6, 3, 5],
        },
      ],
    });
    expect(mixedElement.querySelector(".facet-area path[fill]:not([fill='none'])")).toBeTruthy();
    expect(mixedElement.querySelectorAll(".facet-scatter .facet-point")).toHaveLength(4);
    expect(mixedElement.innerHTML).not.toContain("NaN");
  });

  it("creates a donut-style polar chart with a configurable centre fill", () => {
    const element = container();
    new FacetViz(element, {
      chart: {
        ...chart,
        type: "column",
        polar: true,
        polarInnerSize: "38%",
        polarInnerBackgroundColor: "#ffffff",
        polarGridLineMode: "sector",
      },
      xAxis: {
        categories: ["N", "E", "S", "W"],
        labels: { position: "inner", offset: 14 },
        title: { text: "Direction", position: "center" },
      },
      series: [{ data: [4, 7, 5, 8] }],
    });

    const hole = element.querySelector<SVGCircleElement>(".facet-polar-hole");
    expect(hole).toBeTruthy();
    expect(Number(hole?.getAttribute("r"))).toBeGreaterThan(30);
    expect(hole?.getAttribute("fill")).toBe("#ffffff");

    const centreX = Number(hole?.getAttribute("cx"));
    const centreY = Number(hole?.getAttribute("cy"));
    const title = [
      ...element.querySelectorAll<SVGTextElement>(".facet-polar-x-title"),
    ].find((node) => node.textContent === "Direction");
    expect(Number(title?.getAttribute("x"))).toBeCloseTo(centreX);
    expect(Number(title?.getAttribute("y"))).toBeCloseTo(centreY);
    expect(title?.getAttribute("dominant-baseline")).toBe("middle");
    const curvedLabels = [
      ...element.querySelectorAll<SVGTextPathElement>(
        ".facet-polar-curved-label textPath",
      ),
    ];
    expect(curvedLabels).toHaveLength(4);
    expect(curvedLabels.map((node) => node.textContent)).toEqual([
      "N",
      "E",
      "S",
      "W",
    ]);
    expect(
      curvedLabels.every(
        (node) =>
          node.getAttribute("startOffset") === "50%" &&
          node.getAttribute("href")?.startsWith("#facet-polar-label-path-"),
      ),
    ).toBe(true);
    const curvedPath = element.querySelector<SVGPathElement>(
      "defs path[id^='facet-polar-label-path-']",
    );
    const curvedRadius = Number(
      curvedPath?.getAttribute("d")?.match(/\bA ([\d.]+)/)?.[1],
    );
    expect(Number(hole?.getAttribute("r")) - curvedRadius).toBeCloseTo(14);
    const sectorLines = [
      ...element.querySelectorAll<SVGLineElement>(".facet-polar-sector-line"),
    ];
    expect(sectorLines).toHaveLength(4);
    expect(element.querySelectorAll(".facet-polar-spoke")).toHaveLength(0);
    expect(
      sectorLines.every(
        (line) =>
          Number(line.getAttribute("x1")) !== centreX ||
          Number(line.getAttribute("y1")) !== centreY,
      ),
    ).toBe(true);
  });

  it("validates annotations, responsive rules, and unsupported polar series", () => {
    const result = validateChartOptions({
      chart: { type: "pie", polar: true },
      annotations: [{ x: {}, yAxis: 3 }],
      responsive: [{ condition: { maxWidth: -1 }, options: null }],
      series: [{ data: [1, 2] }],
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "annotation.x.value",
        "annotation.axis.index",
        "responsive.condition.non_negative",
        "responsive.options.object",
        "chart.polar.series.unsupported",
      ]),
    );

    expect(
      validateChartOptions({
        chart: {
          type: "column",
          polar: true,
          polarInnerSize: "120%",
          polarGridLineMode: "wedges",
        },
        xAxis: {
          labels: { position: "middle", offset: -1 },
          title: { position: "inside" },
        },
        series: [{ data: [1] }],
      }).issues.map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        "chart.polar_inner_size.valid",
        "chart.polar_grid_line_mode.unknown",
        "axis.labels.position.unknown",
        "axis.labels.offset.non_negative",
        "axis.title.position.unknown",
      ]),
    );
  });
});
