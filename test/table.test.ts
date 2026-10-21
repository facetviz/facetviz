import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacetTable } from "../src/index.js";

function container(): HTMLElement {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
}

describe("FacetTable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders native value cells and one chart per chart cell", () => {
    interface ProductRow {
      product: string;
      revenue: number;
      trend: number[];
    }
    const element = container();
    const table = new FacetTable<ProductRow>(element, {
      caption: "Product performance",
      rows: [
        { product: "Alpha", revenue: 1200, trend: [2, 4, 3, 6] },
        { product: "Beta", revenue: 900, trend: [5, 3, 4, 2] },
      ],
      columns: [
        { key: "product", header: "Product" },
        {
          key: "revenue",
          header: "Revenue",
          align: "right",
          formatter: (value) => `$${Number(value).toLocaleString("en-US")}`,
        },
        { key: "trend", header: "Trend", chart: { type: "sparkline" } },
      ],
    });

    expect(element.querySelector("caption")?.textContent).toBe("Product performance");
    expect([...element.querySelectorAll("th")].map((cell) => cell.textContent))
      .toEqual(["Product", "Revenue", "Trend"]);
    expect(element.textContent).toContain("$1,200");
    expect(element.querySelectorAll(".facet-table-chart svg")).toHaveLength(2);
    expect(element.querySelectorAll(".facet-sparkline")).toHaveLength(2);
    expect(table.charts).toHaveLength(2);
  });

  it("renders recursive column headers and processes nested measure columns", () => {
    interface PivotRow {
      category: string;
      bengaluruRevenue: number;
      bengaluruAverage: number;
      chennaiRevenue: number;
      chennaiAverage: number;
    }
    const element = container();
    const table = new FacetTable<PivotRow>(element, {
      rows: [
        { category: "Beverages", bengaluruRevenue: 949.19, bengaluruAverage: 86.29, chennaiRevenue: 36797.68, chennaiAverage: 1128.37 },
        { category: "Grocery", bengaluruRevenue: 0, bengaluruAverage: 0, chennaiRevenue: 21451.02, chennaiAverage: 489.64 },
      ],
      columns: [
        { key: "category", header: "Category" },
        {
          header: "India",
          headerStyle: { backgroundColor: "#312e81" },
          columns: [
            {
              header: "Bengaluru",
              columns: [
                { key: "bengaluruRevenue", header: "Revenue", sortable: true, format: "{value:,.2f}" },
                { key: "bengaluruAverage", header: "Average", format: "{value:,.2f}" },
              ],
            },
            {
              header: "Chennai",
              columns: [
                { key: "chennaiRevenue", header: "Revenue", filterable: true, format: "{value:,.2f}" },
                { key: "chennaiAverage", header: "Average", format: "{value:,.2f}" },
              ],
            },
          ],
        },
      ],
      style: {
        columnGroupHeader: { textTransform: "uppercase" },
      },
    });

    const headerRows = element.querySelectorAll<HTMLTableRowElement>("thead tr");
    expect(headerRows).toHaveLength(3);
    expect([...headerRows[0].cells].map((cell) => cell.textContent)).toEqual([
      "Category",
      "India",
    ]);
    expect(headerRows[0].cells[0].rowSpan).toBe(3);
    expect(headerRows[0].cells[1].colSpan).toBe(4);
    expect(headerRows[0].cells[1].scope).toBe("colgroup");
    expect(headerRows[0].cells[1].style.backgroundColor).toBe("#312e81");
    expect(headerRows[0].cells[1].style.textTransform).toBe("uppercase");
    expect([...headerRows[1].cells].map((cell) => cell.textContent)).toEqual([
      "Bengaluru",
      "Chennai",
    ]);
    expect([...headerRows[1].cells].map((cell) => cell.colSpan)).toEqual([2, 2]);
    expect([...headerRows[2].cells].map((cell) =>
      cell.querySelector(".facet-table-heading-label")?.textContent ??
      cell.querySelector(".facet-table-sort-button")?.childNodes[0]?.textContent ??
      cell.textContent
    )).toEqual([
      "Revenue",
      "Average",
      "Revenue",
      "Average",
    ]);
    expect(element.querySelectorAll("tbody tr:first-child td")).toHaveLength(5);

    table.sortBy("bengaluruRevenue", "asc");
    expect(element.querySelector("tbody tr:first-child td")?.textContent).toBe("Grocery");
    table.setFilter("chennaiRevenue", "36797");
    expect(element.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(element.querySelector("tbody tr:first-child td")?.textContent).toBe("Beverages");
  });

  it("rejects an empty nested column group", () => {
    expect(() => new FacetTable(container(), {
      rows: [{ category: "Beverages" }],
      columns: [
        { key: "category" },
        { header: "Empty", columns: [] },
      ],
    })).toThrow(/must contain at least one column/);
  });

  it("aligns columns horizontally and vertically and formats text values", () => {
    const element = container();
    new FacetTable(element, {
      rows: [{ product: "Atlas", revenue: 128400, rank: 1 }],
      columns: [
        {
          key: "product",
          horizontalAlign: "center",
          verticalAlign: "top",
          format: "Product: {value}",
        },
        {
          key: "revenue",
          horizontalAlign: "right",
          verticalAlign: "bottom",
          format: "{value:$,.0f}",
          sortable: true,
        },
        {
          key: "rank",
          format: "ignored {value}",
          formatter: (value) => `#${value}`,
        },
      ],
    });

    const headings = element.querySelectorAll<HTMLTableCellElement>("th");
    const cells = element.querySelectorAll<HTMLTableCellElement>("td");
    expect(headings[0].style.textAlign).toBe("center");
    expect(headings[0].style.verticalAlign).toBe("top");
    expect(cells[0].style.textAlign).toBe("center");
    expect(cells[0].style.verticalAlign).toBe("top");
    expect(cells[0].textContent).toBe("Product: Atlas");
    expect(headings[1].style.textAlign).toBe("right");
    expect(headings[1].style.verticalAlign).toBe("bottom");
    expect(element.querySelector<HTMLButtonElement>(".facet-table-sort-button")?.style.justifyContent)
      .toBe("flex-end");
    expect(cells[1].textContent).toBe("$128,400");
    expect(cells[2].textContent).toBe("#1");
  });

  it("renders and processes row-level cell descriptors", () => {
    const element = container();
    const callbackValues: unknown[] = [];
    const columnValues: unknown[] = [];
    const table = new FacetTable(element, {
      rows: [
        {
          product: "Atlas",
          revenue: {
            value: 128400,
            color: "red",
            backgroundColor: "green",
            fontWeight: 900,
            style: { borderLeft: "3px solid orange" },
          },
          growth: {
            value: 12.4,
            prefix: "+",
            suffix: "%",
            color: "#45f354",
          },
          trend: {
            value: [1, 2, 3],
            backgroundColor: "lavender",
          },
        },
        { product: "Beacon", revenue: 86900, growth: 7.1, trend: [2, 3, 4] },
      ],
      columns: [
        { key: "product" },
        {
          key: "revenue",
          format: "{value:$,.0f}",
          sortable: true,
          filterable: true,
          style: (value) => {
            columnValues.push(value);
            return { color: "purple", backgroundColor: "pink" };
          },
          headerStyle: { color: "purple", backgroundColor: "pink" },
        },
        { key: "growth" },
        { key: "trend", chart: { scale: "shared" } },
      ],
      layout: { rowDensity: "compact" },
      appearance: {
        headerRow: { textColor: "white", fillColor: "black" },
        rowsAndColumns: { textColor: "black", rowFill: "beige" },
      },
      style: {
        cell: (value) => {
          callbackValues.push(value);
          return { color: "blue", backgroundColor: "white", padding: 12 };
        },
        row: { color: "orange", backgroundColor: "yellow" },
        headerCell: { color: "blue", backgroundColor: "gray" },
      },
    });
    const atlasCells = element.querySelectorAll<HTMLTableCellElement>("tbody tr:first-child td");
    const beaconCells = element.querySelectorAll<HTMLTableCellElement>("tbody tr:nth-child(2) td");
    const revenueHeading = element.querySelectorAll<HTMLTableCellElement>("thead th")[1];

    expect(atlasCells[1].textContent).toBe("$128,400");
    expect(atlasCells[1].style.color).toBe("red");
    expect(atlasCells[1].style.backgroundColor).toBe("green");
    expect(atlasCells[1].style.fontWeight).toBe("900");
    expect(atlasCells[1].style.borderLeft).toBe("3px solid orange");
    expect(atlasCells[2].textContent).toBe("+12.4%");
    expect(atlasCells[2].style.color).toBe("#45f354");
    expect(atlasCells[3].style.backgroundColor).toBe("lavender");
    expect(atlasCells[0].style.padding).toBe("12px");
    expect(beaconCells[0].style.color).toBe("orange");
    expect(beaconCells[0].style.backgroundColor).toBe("yellow");
    expect(beaconCells[1].style.color).toBe("purple");
    expect(beaconCells[1].style.backgroundColor).toBe("pink");
    expect(revenueHeading.style.color).toBe("purple");
    expect(revenueHeading.style.backgroundColor).toBe("pink");
    expect(table.charts).toHaveLength(2);
    expect(callbackValues).toContain(128400);
    expect(callbackValues).not.toContainEqual(expect.objectContaining({ value: 128400 }));
    expect(columnValues).toContain(128400);

    element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!.click();
    expect(element.querySelector("tbody tr:first-child td")?.textContent).toBe("Beacon");
    table.setFilter("revenue", "128400");
    expect(element.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(element.querySelector("tbody tr:first-child td")?.textContent).toBe("Atlas");
  });

  it("applies structured layout and appearance options", () => {
    const element = container();
    new FacetTable(element, {
      rows: [
        { dimension: "Alpha", value: 10, empty: null },
        { dimension: "Beta", value: 20, empty: null },
      ],
      columns: [
        { key: "dimension", role: "dimension" },
        { key: "value", role: "value" },
        { key: "empty", role: "dimension" },
      ],
      layout: {
        rowDensity: "compact",
        bodyTextSize: 13,
        showHeaderRow: true,
        wrapText: false,
        freezeHeaderRow: true,
        freezeFirstColumn: true,
      },
      appearance: {
        headerRow: {
          fillColor: "#112233",
          textColor: "#ffffff",
          textSize: 15,
          alignment: "center",
          bold: false,
          italic: true,
        },
        rowsAndColumns: {
          textColor: "#223344",
          rowFill: "#ffffff",
          dimensionAlignment: "center",
          valueAlignment: "right",
          displayEmptyCellAs: "—",
          bandedRows: true,
          bandedRowsAlternateColor: "#eeeeee",
          bandedColumns: true,
          bandedColumnsAlternateColor: "#dddddd",
          emphasizeFirstColumn: true,
          emphasizeLastColumn: true,
          highlightRowOnHover: true,
          hoverColor: "#ffeeaa",
        },
        borders: {
          horizontalBorders: true,
          verticalBorders: true,
          outsideBorder: true,
          borderColor: "#123456",
          borderWidth: 2,
        },
      },
    });

    const root = element.querySelector<HTMLElement>(".facet-table-root")!;
    const table = element.querySelector<HTMLTableElement>("table")!;
    const body = element.querySelector<HTMLTableSectionElement>("tbody")!;
    const headings = element.querySelectorAll<HTMLTableCellElement>("th");
    const rows = element.querySelectorAll<HTMLTableRowElement>("tbody tr");
    const firstCells = rows[0].querySelectorAll<HTMLTableCellElement>("td");

    expect(root.style.overflow).toBe("auto");
    expect(table.style.borderCollapse).toBe("separate");
    expect(table.style.borderWidth).toBe("2px");
    expect(table.style.borderColor).toBe("#123456");
    expect(body.style.fontSize).toBe("13px");
    expect(headings[0].style.background).toBe("#112233");
    expect(headings[0].style.color).toBe("#ffffff");
    expect(headings[0].style.fontSize).toBe("15px");
    expect(headings[0].style.textAlign).toBe("center");
    expect(headings[0].style.fontWeight).toBe("400");
    expect(headings[0].style.fontStyle).toBe("italic");
    expect(headings[0].style.position).toBe("sticky");
    expect(headings[0].style.top).toBe("0px");
    expect(headings[0].style.left).toBe("0px");

    expect(firstCells[0].style.padding).toBe("4px 6px");
    expect(firstCells[0].style.whiteSpace).toBe("nowrap");
    expect(firstCells[0].style.position).toBe("sticky");
    expect(firstCells[0].style.textAlign).toBe("center");
    expect(firstCells[0].style.fontWeight).toBe("700");
    expect(firstCells[1].style.textAlign).toBe("right");
    expect(firstCells[1].style.backgroundColor).toBe("#dddddd");
    expect(firstCells[2].textContent).toBe("—");
    expect(firstCells[2].style.fontWeight).toBe("700");
    expect(firstCells[0].style.color).toBe("#223344");
    expect(rows[1].style.backgroundColor).toBe("#eeeeee");
    expect(firstCells[0].style.borderBottom).toBe("2px solid #123456");
    expect(firstCells[0].style.borderRight).toBe("2px solid #123456");
    expect(firstCells[2].style.borderRight).toContain("none");

    rows[0].dispatchEvent(new MouseEvent("mouseenter"));
    expect([...firstCells].every((cell) => cell.style.backgroundColor === "#ffeeaa"))
      .toBe(true);
    rows[0].dispatchEvent(new MouseEvent("mouseleave"));
    expect(firstCells[1].style.backgroundColor).toBe("#dddddd");
  });

  it("can hide the header and disable borders while wrapping empty cells", () => {
    const element = container();
    new FacetTable(element, {
      rows: [{ name: null }],
      columns: [{ key: "name" }],
      layout: { showHeaderRow: false, rowDensity: "crazy", wrapText: true },
      appearance: {
        rowsAndColumns: { displayEmptyCellAs: "(blank)" },
        borders: { horizontalBorders: false, verticalBorders: false, outsideBorder: false },
      },
    });
    const cell = element.querySelector<HTMLTableCellElement>("td")!;
    expect(element.querySelector("thead")).toBeNull();
    expect(cell.textContent).toBe("(blank)");
    expect(cell.style.padding).toBe("6px 8px");
    expect(cell.style.whiteSpace).toBe("normal");
    expect(cell.style.overflowWrap).toBe("anywhere");
    expect(cell.style.borderBottom).toContain("none");
    expect(cell.style.borderRight).toContain("none");
  });

  it.each([
    ["responsive", "10px 12px"],
    ["compact", "4px 6px"],
    ["cozy", "6px 8px"],
    ["crazy", "6px 8px"],
    ["comfortable", "10px 12px"],
  ] as const)("supports the %s row-density preset", (rowDensity, expected) => {
    const element = container();
    if (rowDensity === "responsive")
      Object.defineProperty(element, "clientWidth", { value: 1000, configurable: true });
    new FacetTable(element, {
      rows: [{ name: "Alpha" }],
      columns: [{ key: "name" }],
      layout: { rowDensity },
    });
    const padding = element.querySelector<HTMLTableCellElement>("td")!.style.padding;
    expect(padding).toBe(expected);
  });

  it.each([
    ["responsive", "4px 8px"],
    ["compact", "1px 4px"],
    ["cozy", "2px 6px"],
    ["crazy", "2px 6px"],
    ["comfortable", "4px 8px"],
  ] as const)("uses tighter %s padding for chart cells", (rowDensity, expected) => {
    const element = container();
    if (rowDensity === "responsive")
      Object.defineProperty(element, "clientWidth", { value: 1000, configurable: true });
    new FacetTable(element, {
      rows: [{ trend: [1, 2, 3] }],
      columns: [{ key: "trend", chart: { type: "line" } }],
      layout: { rowDensity },
    });
    const padding = element.querySelector<HTMLTableCellElement>("td")!.style.padding;
    expect(padding).toBe(expected);
  });

  it("gives each cell chart its own options when options is a function", () => {
    const table = new FacetTable(container(), {
      rows: [
        { name: "A", cats: ["x", "y"], trend: [1, 2] },
        { name: "B", cats: ["z"], trend: [3] },
      ],
      columns: [
        { key: "name" },
        {
          key: "trend",
          chart: {
            type: "column",
            options: (_value, row) => ({ xAxis: { categories: row.cats as string[] } }),
          },
        },
      ],
    });
    const cats = table.charts.map((chart) => (chart.options.xAxis as { categories?: string[] }).categories);
    expect(cats).toEqual([["x", "y"], ["z"]]);
    // Axes stay hidden under the cell's own options.
    expect((table.charts[0].options.xAxis as { visible?: boolean }).visible).toBe(false);
  });

  it("uses a shared value domain for every chart in a comparable column", () => {
    const table = new FacetTable(container(), {
      rows: [
        { name: "Small", trend: [1, 2, 3] },
        { name: "Large", trend: [10, 20, 30] },
      ],
      columns: [
        { key: "name" },
        { key: "trend", chart: { scale: "shared" } },
      ],
    });

    const domains = table.charts.map((chart) => chart.options.yAxis);
    expect(domains[0]).toEqual(domains[1]);
    expect((domains[0] as { min: number }).min).toBeLessThan(1);
    expect((domains[0] as { max: number }).max).toBeGreaterThan(30);
  });

  it("supports custom per-row series and rebuilds cleanly on setRows", () => {
    const element = container();
    const table = new FacetTable(element, {
      rows: [{ name: "Alpha", actual: 6 }],
      columns: [
        { key: "name" },
        {
          key: "actual",
          chart: {
            type: "bar",
            series: (value) => [{ data: [Number(value)], color: "#123456" }],
          },
        },
      ],
    });

    expect(element.querySelectorAll("svg")).toHaveLength(1);
    expect(element.querySelectorAll(".facet-column .facet-point")).toHaveLength(1);
    expect(element.querySelectorAll(".facet-axis")).toHaveLength(0);
    expect(table.charts[0].series[0].color).toBe("#123456");
    table.setRows([
      { name: "Beta", actual: 4 },
      { name: "Gamma", actual: 8 },
    ]);
    expect(element.querySelectorAll("svg")).toHaveLength(2);
    expect(table.charts).toHaveLength(2);

    table.destroy();
    expect(element.children).toHaveLength(0);
    expect(table.charts).toHaveLength(0);
  });

  it("renders declarative multi-series combo charts from cell values", () => {
    const element = container();
    const table = new FacetTable(element, {
      rows: [{
        product: "Alpha",
        comparison: [
          { type: "column" as const, name: "Actual", data: [4, 6, 8] },
          { type: "line" as const, name: "Target", data: [5, 7, 9] },
        ],
      }],
      columns: [
        { key: "product" },
        {
          key: "comparison",
          chart: {
            type: "column",
            height: 90,
            series: "value",
            options: { legend: { enabled: true } },
          },
        },
      ],
    });

    expect(table.charts).toHaveLength(1);
    expect(table.charts[0].series.map((series) => series.type))
      .toEqual(["column", "line"]);
    expect(element.querySelectorAll(".facet-column .facet-point")).toHaveLength(3);
    expect(element.querySelector(".facet-line path")).not.toBeNull();
    expect(element.querySelectorAll(".facet-legend-item")).toHaveLength(2);
  });

  it("renders a useful empty state", () => {
    const element = container();
    new FacetTable(element, {
      rows: [],
      columns: [{ key: "name" }],
      emptyText: "Nothing here",
    });
    expect(element.querySelector(".facet-table-empty")?.textContent).toBe("Nothing here");
  });

  it("applies top-level structural and conditional style overrides", () => {
    const element = container();
    new FacetTable(element, {
      rows: [
        { name: "Alpha", score: 8, trend: [2, 4, 8] },
        { name: "Beta", score: 3, trend: [5, 4, 3] },
      ],
      columns: [
        { key: "name" },
        { key: "score" },
        { key: "trend", chart: {} },
      ],
      style: {
        root: { backgroundColor: "#f0f0f0", padding: 6 },
        table: { fontSize: "13px" },
        headerCell: { color: "#112233" },
        row: (_row, index) => ({ backgroundColor: index % 2 ? "#eeeeee" : "#ffffff" }),
        cell: (value) => typeof value === "number" ? { fontWeight: 700 } : {},
        chartCell: { borderLeft: "2px solid #abcdef" },
        chartHost: { opacity: 0.9 },
      },
    });

    expect((element.querySelector(".facet-table-root") as HTMLElement).style.padding)
      .toBe("6px");
    expect((element.querySelector("table") as HTMLElement).style.fontSize).toBe("13px");
    expect((element.querySelector("th") as HTMLElement).style.color).toBe("#112233");
    const rows = element.querySelectorAll<HTMLElement>(".facet-table-row");
    expect(rows[0].style.backgroundColor).toBe("#ffffff");
    expect(rows[1].style.backgroundColor).toBe("#eeeeee");
    expect(rows[0].children[1].getAttribute("style")).toContain("font-weight: 700");
    expect((element.querySelector(".facet-table-chart-cell") as HTMLElement).style.borderLeft)
      .toContain("2px");
    expect((element.querySelector(".facet-table-chart") as HTMLElement).style.opacity)
      .toBe("0.9");
  });

  it("paginates large tables and only mounts charts for the visible page", () => {
    const element = container();
    const changes: Array<[number, number]> = [];
    const rows = Array.from({ length: 8 }, (_, index) => ({
      name: `Row ${index + 1}`,
      trend: [index + 1, index + 2],
    }));
    const table = new FacetTable(element, {
      rows,
      columns: [
        { key: "name" },
        { key: "trend", chart: { scale: "shared" } },
      ],
      pagination: {
        pageSize: 3,
        pageSizeOptions: [2, 3, 5],
        maxPageButtons: 3,
        onPageChange: (page, pageSize) => changes.push([page, pageSize]),
      },
      style: {
        pagination: { justifyContent: "center" },
        activePageButton: { backgroundColor: "#123456" },
      },
    });

    expect(table.page).toBe(1);
    expect(table.pageCount).toBe(3);
    expect(element.querySelectorAll(".facet-table-row")).toHaveLength(3);
    expect(element.querySelectorAll(".facet-table-chart svg")).toHaveLength(3);
    expect((table.charts[0].options.yAxis as { max: number }).max).toBeGreaterThan(9);
    expect(element.textContent).toContain("Row 1");
    expect(element.textContent).not.toContain("Row 4");
    expect((element.querySelector(".facet-table-pagination") as HTMLElement).style.justifyContent)
      .toBe("center");
    expect((element.querySelector(".facet-table-page-button.is-active") as HTMLElement).style.backgroundColor)
      .toBe("#123456");

    const next = [...element.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Next")!;
    next.click();
    expect(table.page).toBe(2);
    expect(element.textContent).toContain("Row 4");
    expect(element.textContent).not.toContain("Row 1");
    expect(element.querySelectorAll(".facet-table-chart svg")).toHaveLength(3);
    expect(changes).toEqual([[2, 3]]);

    const select = element.querySelector<HTMLSelectElement>(".facet-table-page-size-select")!;
    select.value = "5";
    select.dispatchEvent(new Event("change"));
    expect(table.page).toBe(1);
    expect(table.pageSize).toBe(5);
    expect(table.pageCount).toBe(2);
    expect(element.querySelectorAll(".facet-table-row")).toHaveLength(5);
    expect(element.querySelectorAll(".facet-table-chart svg")).toHaveLength(5);
    expect(changes).toEqual([[2, 3], [1, 5]]);

    table.setPageSize(8);
    expect(table.pageCount).toBe(1);
    expect(element.querySelector(".facet-table-pagination")).not.toBeNull();

    table.setRows(rows.slice(0, 2));
    expect(table.page).toBe(1);
    expect(element.querySelectorAll(".facet-table-row")).toHaveLength(2);
    expect(element.querySelector(".facet-table-pagination")).toBeNull();
  });

  it("sorts a column before pagination and cycles back to source order", () => {
    const element = container();
    const table = new FacetTable(element, {
      rows: [
        { name: "Charlie", trend: [3, 4] },
        { name: "Alpha", trend: [1, 2] },
        { name: "Bravo", trend: [2, 3] },
      ],
      columns: [
        { key: "name", header: "Product", sortable: true },
        { key: "trend", chart: {} },
      ],
      pagination: { pageSize: 2, pageSizeOptions: [2] },
      style: {
        sortButton: { color: "#123456" },
        sortIndicator: { marginLeft: 2 },
      },
    });
    const visibleNames = () => [...element.querySelectorAll("tbody tr")]
      .map((row) => row.children[0]?.textContent);
    const sortButton = () => element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!;
    const sortHeading = () => element.querySelector<HTMLTableCellElement>("th[aria-sort]")!;
    const sortIndicator = () => element.querySelector<SVGSVGElement>("svg.facet-table-sort-indicator")!;

    expect(visibleNames()).toEqual(["Charlie", "Alpha"]);
    expect(sortHeading().getAttribute("aria-sort")).toBe("none");
    expect(sortButton().style.color).toBe("#123456");
    expect(sortIndicator().namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(sortIndicator().getAttribute("viewBox")).toBe("0 0 14 14");
    expect(sortIndicator().style.width).toBe("16px");
    expect(sortIndicator().dataset.direction).toBe("none");
    expect(sortIndicator().querySelectorAll("path")).toHaveLength(2);
    expect(table.charts).toHaveLength(2);

    table.setPage(2);
    sortButton().click();
    expect(table.page).toBe(1);
    expect(table.sort).toEqual({ key: "name", direction: "asc" });
    expect(sortHeading().getAttribute("aria-sort")).toBe("ascending");
    expect(sortIndicator().dataset.direction).toBe("asc");
    expect(sortIndicator().querySelectorAll("path")).toHaveLength(1);
    expect(visibleNames()).toEqual(["Alpha", "Bravo"]);
    expect(table.charts).toHaveLength(2);

    sortButton().click();
    expect(table.sort).toEqual({ key: "name", direction: "desc" });
    expect(sortHeading().getAttribute("aria-sort")).toBe("descending");
    expect(sortIndicator().dataset.direction).toBe("desc");
    expect(visibleNames()).toEqual(["Charlie", "Bravo"]);

    sortButton().click();
    expect(table.sort).toBeUndefined();
    expect(sortHeading().getAttribute("aria-sort")).toBe("none");
    expect(visibleNames()).toEqual(["Charlie", "Alpha"]);
  });

  it("draws a custom sort indicator from path data", () => {
    const element = container();
    new FacetTable(element, {
      rows: [{ name: "B" }, { name: "A" }],
      columns: [{ key: "name", sortable: true }],
      sortIndicator: {
        paths: { asc: ["M4 10l3-4 3 4z"], desc: ["M4 4l3 4 3-4z"], none: ["M4 6l3-3 3 3z", "M4 8l3 3 3-3z"] },
        size: 14,
        unsortedOpacity: 0.4,
      },
      style: { sortIndicator: { marginLeft: 2 } },
    });
    const indicator = () => element.querySelector<SVGSVGElement>("svg.facet-table-sort-indicator")!;
    const paths = () => [...indicator().querySelectorAll("path")].map((path) => path.getAttribute("d"));

    expect(indicator().getAttribute("width")).toBe("14");
    expect(indicator().style.width).toBe("14px");
    expect(indicator().hasAttribute("stroke")).toBe(false);
    expect(indicator().style.opacity).toBe("0.4");
    expect(indicator().style.marginLeft).toBe("2px");
    expect(indicator().dataset.direction).toBe("none");
    expect(paths()).toEqual(["M4 6l3-3 3 3z", "M4 8l3 3 3-3z"]);

    element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!.click();
    expect(indicator().dataset.direction).toBe("asc");
    expect(indicator().style.opacity).toBe("1");
    expect(paths()).toEqual(["M4 10l3-4 3 4z"]);

    element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!.click();
    expect(paths()).toEqual(["M4 4l3 4 3-4z"]);
  });

  it("draws a sort indicator returned by a function", () => {
    const element = container();
    const render = vi.fn((direction?: "asc" | "desc") => {
      const icon = document.createElement("span");
      icon.textContent = direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕";
      return icon;
    });
    new FacetTable(element, {
      rows: [{ name: "B" }, { name: "A" }],
      columns: [{ key: "name", sortable: true }],
      sortIndicator: render,
    });
    const indicator = () => element.querySelector<HTMLElement>(".facet-table-sort-indicator")!;

    expect(render).toHaveBeenCalledWith(undefined);
    expect(indicator().textContent).toBe("↕");
    expect(indicator().dataset.direction).toBe("none");
    expect(indicator().getAttribute("aria-hidden")).toBe("true");

    element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!.click();
    expect(indicator().textContent).toBe("↑");
    expect(indicator().dataset.direction).toBe("asc");
  });

  it("supports an initial direction, custom comparator, and programmatic sorting", () => {
    const element = container();
    const table = new FacetTable(element, {
      rows: [
        { item: "Small", amount: "$2" },
        { item: "Large", amount: "$30" },
        { item: "Medium", amount: "$10" },
      ],
      columns: [
        { key: "item", sortable: true },
        {
          key: "amount",
          sortable: {
            initialDirection: "desc",
            compare: (a, b) => Number(String(a).slice(1)) - Number(String(b).slice(1)),
          },
        },
      ],
    });
    const visibleItems = () => [...element.querySelectorAll("tbody tr")]
      .map((row) => row.children[0]?.textContent);

    expect(table.sort).toEqual({ key: "amount", direction: "desc" });
    expect(visibleItems()).toEqual(["Large", "Medium", "Small"]);
    table.sortBy("item", "asc");
    expect(visibleItems()).toEqual(["Large", "Medium", "Small"]);
    table.sortBy("item", "desc");
    expect(visibleItems()).toEqual(["Small", "Medium", "Large"]);
    table.clearSort();
    expect(visibleItems()).toEqual(["Small", "Large", "Medium"]);
  });

  it("filters a column before sorting and pagination through the header panel", () => {
    const element = container();
    const table = new FacetTable(element, {
      rows: [
        { name: "Alpha", amount: 30 },
        { name: "Beta", amount: 10 },
        { name: "Alpine", amount: 20 },
        { name: "Gamma", amount: 40 },
      ],
      columns: [
        {
          key: "name",
          header: "Product",
          sortable: true,
          filterable: { placeholder: "Find a product" },
        },
        { key: "amount", filterable: true },
      ],
      pagination: { pageSize: 2, pageSizeOptions: [2], alwaysShow: true },
      style: {
        filterIndicator: { color: "#123456" },
        activeFilterButton: { backgroundColor: "#abcdef" },
      },
    });
    const visibleNames = () => [...element.querySelectorAll("tbody tr")]
      .map((row) => row.children[0]?.textContent);
    const filterButton = () => element.querySelector<HTMLButtonElement>(
      'button[aria-label="Filter Product"]',
    )!;

    expect(filterButton().querySelector("svg.facet-table-filter-indicator")).not.toBeNull();
    expect(filterButton().querySelector<SVGSVGElement>("svg")?.style.color).toBe("#123456");
    filterButton().click();
    expect(filterButton().getAttribute("aria-expanded")).toBe("true");
    const input = element.querySelector<HTMLInputElement>(
      'input[aria-label="Filter value for Product"]',
    )!;
    expect(input.placeholder).toBe("Find a product");
    input.value = "alp";
    element.querySelector<HTMLButtonElement>(".facet-table-filter-action:last-child")!.click();

    expect(table.filters).toEqual([{ key: "name", value: "alp" }]);
    expect(table.page).toBe(1);
    expect(visibleNames()).toEqual(["Alpha", "Alpine"]);
    expect(element.querySelector(".facet-table-pagination-info")?.textContent)
      .toContain("1–2 / 2");
    expect(filterButton().dataset.active).toBe("true");
    expect(filterButton().style.backgroundColor).toBe("#abcdef");

    element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!.click();
    element.querySelector<HTMLButtonElement>(".facet-table-sort-button")!.click();
    expect(visibleNames()).toEqual(["Alpine", "Alpha"]);

    filterButton().click();
    element.querySelector<HTMLButtonElement>(".facet-table-filter-action")!.click();
    expect(table.filters).toEqual([]);
    expect(visibleNames()).toEqual(["Gamma", "Beta"]);
  });

  it("supports initial filters, custom predicates, and programmatic clearing", () => {
    const element = container();
    const table = new FacetTable(element, {
      rows: [
        { item: "Small", amount: 10 },
        { item: "Medium", amount: 20 },
        { item: "Large", amount: 30 },
      ],
      columns: [
        { key: "item" },
        {
          key: "amount",
          filterable: {
            initialValue: "20",
            predicate: (value, filterValue) => Number(value) >= Number(filterValue),
          },
        },
      ],
      emptyText: "No matches",
    });
    const visibleItems = () => [...element.querySelectorAll("tbody tr")]
      .map((row) => row.children[0]?.textContent);

    expect(table.filters).toEqual([{ key: "amount", value: "20" }]);
    expect(visibleItems()).toEqual(["Medium", "Large"]);
    table.setFilter("amount", "40");
    expect(element.querySelector(".facet-table-empty")?.textContent).toBe("No matches");
    table.clearFilters();
    expect(visibleItems()).toEqual(["Small", "Medium", "Large"]);
    expect(() => table.setFilter("item", "Small")).toThrow(/not filterable/);
  });

  it("caches processed rows until rows, columns, or filters change", () => {
    const element = container();
    const predicate = vi.fn(() => true);
    const table = new FacetTable(element, {
      rows: [
        { item: "One", amount: 1 },
        { item: "Two", amount: 2 },
        { item: "Three", amount: 3 },
        { item: "Four", amount: 4 },
      ],
      columns: [
        { key: "item" },
        {
          key: "amount",
          sortable: true,
          filterable: { initialValue: "1", predicate },
        },
      ],
      pagination: { pageSize: 2, pageSizeOptions: [2] },
    });

    expect(predicate).toHaveBeenCalledTimes(4);
    expect(table.pageCount).toBe(2);
    expect(table.pageCount).toBe(2);
    table.setPage(2);
    table.sortBy("amount", "desc");
    expect(predicate).toHaveBeenCalledTimes(4);

    table.setFilter("amount", "2");
    expect(predicate).toHaveBeenCalledTimes(8);
    table.setRows([
      { item: "Five", amount: 5 },
      { item: "Six", amount: 6 },
    ]);
    expect(predicate).toHaveBeenCalledTimes(10);
  });

  it("renders supplied detail, subtotal, and grand-total rows with charts", () => {
    interface SalesRow {
      category: string;
      product: string;
      city: string;
      unitPrice: number;
      revenue: number;
      rowType: "detail" | "subtotal" | "grandTotal";
      groupPath: string[];
    }
    const element = container();
    const table = new FacetTable<SalesRow>(element, {
      rows: [
        { category: "Beverages", product: "Bread", city: "Bengaluru", unitPrice: 86.29, revenue: 949.19, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread", city: "Chennai", unitPrice: 1128.37, revenue: 36797.68, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread — subtotal", city: "", unitPrice: 1214.66, revenue: 37746.87, rowType: "subtotal", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages — subtotal", product: "", city: "", unitPrice: 1214.66, revenue: 37746.87, rowType: "subtotal", groupPath: ["Beverages"] },
        { category: "Grocery", product: "Bread", city: "Chennai", unitPrice: 442.04, revenue: 13261.20, rowType: "detail", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Bread — subtotal", city: "", unitPrice: 442.04, revenue: 13261.20, rowType: "subtotal", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Detergent", city: "Chennai", unitPrice: 537.24, revenue: 8189.82, rowType: "detail", groupPath: ["Grocery", "Detergent"] },
        { category: "Grocery", product: "Detergent — subtotal", city: "", unitPrice: 537.24, revenue: 8189.82, rowType: "subtotal", groupPath: ["Grocery", "Detergent"] },
        { category: "Grocery — subtotal", product: "", city: "", unitPrice: 979.28, revenue: 21451.02, rowType: "subtotal", groupPath: ["Grocery"] },
        { category: "Grand total", product: "", city: "", unitPrice: 2193.94, revenue: 59197.89, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category" },
        { key: "product" },
        { key: "city" },
        { key: "unitPrice", format: "{value:,.2f}" },
        { key: "revenue", format: "{value:,.2f}" },
        {
          key: "revenue",
          header: "Revenue chart",
          chart: { type: "bar", scale: "shared" },
        },
      ],
      style: {
        subtotalRow: { color: "#334155" },
        grandTotalRow: { color: "#0f172a" },
      },
    });

    const rows = [...element.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    const values = rows.map((row) =>
      [...row.cells].slice(0, 5).map((cell) => cell.textContent)
    );
    expect(values).toEqual([
      ["Beverages", "Bread", "Bengaluru", "86.29", "949.19"],
      ["Beverages", "Bread", "Chennai", "1,128.37", "36,797.68"],
      ["Beverages", "Bread — subtotal", "", "1,214.66", "37,746.87"],
      ["Beverages — subtotal", "", "", "1,214.66", "37,746.87"],
      ["Grocery", "Bread", "Chennai", "442.04", "13,261.20"],
      ["Grocery", "Bread — subtotal", "", "442.04", "13,261.20"],
      ["Grocery", "Detergent", "Chennai", "537.24", "8,189.82"],
      ["Grocery", "Detergent — subtotal", "", "537.24", "8,189.82"],
      ["Grocery — subtotal", "", "", "979.28", "21,451.02"],
      ["Grand total", "", "", "2,193.94", "59,197.89"],
    ]);
    expect(element.querySelectorAll(".facet-table-row-detail")).toHaveLength(4);
    expect(element.querySelectorAll(".facet-table-row-subtotal")).toHaveLength(5);
    expect(element.querySelectorAll(".facet-table-row-grand-total")).toHaveLength(1);
    expect(rows[2].dataset.rowType).toBe("subtotal");
    expect(rows[2].style.color).toBe("#334155");
    expect(rows[9].style.color).toBe("#0f172a");
    expect(table.charts).toHaveLength(10);
  });

  it("sorts detail rows within groupPath while keeping summary rows in place", () => {
    interface SalesRow {
      category: string;
      product: string;
      city: string;
      revenue: number;
      rowType: "detail" | "subtotal" | "grandTotal";
      groupPath: string[];
    }
    const element = container();
    const table = new FacetTable<SalesRow>(element, {
      rows: [
        { category: "Beverages", product: "Bread", city: "Bengaluru", revenue: 20, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread", city: "Chennai", revenue: 10, rowType: "detail", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages", product: "Bread — subtotal", city: "", revenue: 30, rowType: "subtotal", groupPath: ["Beverages", "Bread"] },
        { category: "Beverages — subtotal", product: "", city: "", revenue: 30, rowType: "subtotal", groupPath: ["Beverages"] },
        { category: "Grocery", product: "Bread", city: "Mumbai", revenue: 40, rowType: "detail", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Bread", city: "Pune", revenue: 15, rowType: "detail", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery", product: "Bread — subtotal", city: "", revenue: 55, rowType: "subtotal", groupPath: ["Grocery", "Bread"] },
        { category: "Grocery — subtotal", product: "", city: "", revenue: 55, rowType: "subtotal", groupPath: ["Grocery"] },
        { category: "Grand total", product: "", city: "", revenue: 85, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category" },
        { key: "product" },
        { key: "city" },
        { key: "revenue", sortable: true },
      ],
    });
    const cities = () => [...element.querySelectorAll("tbody tr")]
      .map((row) => row.children[2]?.textContent);
    const rowTypes = () => [...element.querySelectorAll<HTMLTableRowElement>("tbody tr")]
      .map((row) => row.dataset.rowType);

    table.sortBy("revenue", "asc");
    expect(cities()).toEqual([
      "Chennai", "Bengaluru", "", "",
      "Pune", "Mumbai", "", "", "",
    ]);
    expect(rowTypes()).toEqual([
      "detail", "detail", "subtotal", "subtotal",
      "detail", "detail", "subtotal", "subtotal", "grandTotal",
    ]);

    table.sortBy("revenue", "desc");
    expect(cities()).toEqual([
      "Bengaluru", "Chennai", "", "",
      "Mumbai", "Pune", "", "", "",
    ]);
    expect(element.querySelector("tbody tr:last-child td")?.textContent)
      .toBe("Grand total");
  });

  it("renders a precomputed average grand total without recalculating it", () => {
    const element = container();
    new FacetTable(element, {
      rows: [
        { category: "Beverages", average: 15, rowType: "subtotal", groupPath: ["Beverages"] },
        { category: "Grocery", average: 100, rowType: "subtotal", groupPath: ["Grocery"] },
        { category: "Grand average", average: 43.33, rowType: "grandTotal", groupPath: [] },
      ],
      columns: [
        { key: "category" },
        { key: "average", format: "{value:.2f}" },
      ],
    });

    const values = [...element.querySelectorAll("tbody tr")]
      .map((row) => row.lastElementChild?.textContent);
    expect(values).toEqual(["15.00", "100.00", "43.33"]);
  });

  it("reports a clicked or chosen body row, with its index in rows", () => {
    const element = container();
    const clicked = vi.fn();
    new FacetTable<{ region: string; revenue: number }>(element, {
      rows: [
        { region: "West", revenue: 2 },
        { region: "East", revenue: 1 },
      ],
      columns: [
        { key: "region", header: "Region" },
        { key: "revenue", header: "Revenue", sortable: true },
      ],
      onRowClick: clicked,
    });
    const rows = element.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(rows[0].classList.contains("facet-table-row-clickable")).toBe(true);
    expect(rows[0].tabIndex).toBe(0);
    rows[1].click();
    expect(clicked).toHaveBeenLastCalledWith({ region: "East", revenue: 1 }, 1, expect.any(MouseEvent));
    rows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(clicked).toHaveBeenLastCalledWith({ region: "West", revenue: 2 }, 0, expect.any(KeyboardEvent));
    expect(clicked).toHaveBeenCalledTimes(2);
  });

  it("leaves rows alone without onRowClick", () => {
    const element = container();
    new FacetTable(element, { rows: [{ a: 1 }], columns: [{ key: "a", header: "A" }] });
    expect(element.querySelector("tbody tr")?.classList.contains("facet-table-row-clickable")).toBe(false);
  });
});
