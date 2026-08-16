import { describe, expect, it } from "vitest";
import { FacetTable, pivotData } from "../src/index.js";
import type {
  FacetTableColumn,
  FacetTableColumnDefinition,
  PivotTableRow,
} from "../src/index.js";

function leafColumns(
  columns: FacetTableColumnDefinition<PivotTableRow>[],
): FacetTableColumn<PivotTableRow>[] {
  return columns.flatMap((column) =>
    "columns" in column ? leafColumns(column.columns) : [column]
  );
}

function columnGroup(
  columns: FacetTableColumnDefinition<PivotTableRow>[],
  header: string,
) {
  return columns.find((column) => "columns" in column && column.header === header) as {
    header: string;
    columns: FacetTableColumnDefinition<PivotTableRow>[];
  };
}

describe("pivotData", () => {
  it("builds nested city measures with hierarchical subtotals and true grand totals", () => {
    const source = [
      { category: "Beverages", product: "Bread", city: "Bengaluru", unitPrice: 86.29, revenue: 949.19 },
      { category: "Beverages", product: "Bread", city: "Chennai", unitPrice: 1128.37, revenue: 36797.68 },
      { category: "Grocery", product: "Bread", city: "Chennai", unitPrice: 442.04, revenue: 13261.2 },
      { category: "Grocery", product: "Detergent", city: "Chennai", unitPrice: 537.24, revenue: 8189.82 },
    ];
    const pivot = pivotData(source, {
      rows: ["category", "product"],
      columns: ["city"],
      measures: [
        { key: "revenue", header: "Revenue", aggregate: "sum", format: "{value:,.2f}", sortable: true },
        { key: "unitPrice", header: "Average Price", aggregate: "average", format: "{value:,.2f}" },
      ],
      subtotals: true,
      grandTotals: true,
    });

    expect(pivot.columns.slice(0, 2).map((column) => column.header)).toEqual([
      "category",
      "product",
    ]);
    expect(pivot.columns.slice(2).map((column) => column.header)).toEqual([
      "Bengaluru",
      "Chennai",
      "Grand total",
    ]);
    expect(columnGroup(pivot.columns, "Bengaluru").columns.map((column) => column.header))
      .toEqual(["Revenue", "Average Price"]);
    expect(pivot.rows.map((row) => [row.category, row.product, row.rowType, row.groupPath]))
      .toEqual([
        ["Beverages", "Bread", "detail", ["Beverages"]],
        ["Beverages — subtotal", "", "subtotal", ["Beverages"]],
        ["Grocery", "Bread", "detail", ["Grocery"]],
        ["Grocery", "Detergent", "detail", ["Grocery"]],
        ["Grocery — subtotal", "", "subtotal", ["Grocery"]],
        ["Grand total", "", "grandTotal", []],
      ]);

    const bengaluru = leafColumns(columnGroup(pivot.columns, "Bengaluru").columns);
    const chennai = leafColumns(columnGroup(pivot.columns, "Chennai").columns);
    const total = leafColumns(columnGroup(pivot.columns, "Grand total").columns);
    const grocerySubtotal = pivot.rows[4];
    const grandTotal = pivot.rows[5];
    expect(grocerySubtotal[bengaluru[0].key]).toBeNull();
    expect(grocerySubtotal[chennai[0].key]).toBeCloseTo(21451.02);
    expect(grocerySubtotal[chennai[1].key]).toBeCloseTo(489.64);
    expect(grandTotal[bengaluru[0].key]).toBeCloseTo(949.19);
    expect(grandTotal[chennai[0].key]).toBeCloseTo(58248.7);
    expect(grandTotal[chennai[1].key]).toBeCloseTo(702.55);
    expect(grandTotal[total[0].key]).toBeCloseTo(59197.89);
    expect(grandTotal[total[1].key]).toBeCloseTo(548.485);
    expect(source).toHaveLength(4);
  });

  it("supports every built-in aggregate, custom aggregates, field formatting, and ordering", () => {
    const source = [
      { category: "A", quarter: "Q1", value: 10, quantity: 1 },
      { category: "A", quarter: "Q1", value: 20, quantity: 3 },
      { category: "A", quarter: "Q2", value: 100, quantity: 1 },
      { category: "B", quarter: "Q1", value: 5, quantity: 2 },
    ];
    const pivot = pivotData(source, {
      rows: [{ key: "category", order: "desc", formatter: (value) => `Category ${value}` }],
      columns: [{ key: "quarter", order: ["Q2", "Q1"], formatter: (value) => `FY ${value}` }],
      measures: [
        { key: "value", header: "Sum", aggregate: "sum" },
        { key: "value", header: "Average", aggregate: "avg" },
        { key: "value", header: "Count", aggregate: "count" },
        { key: "value", header: "Minimum", aggregate: "min" },
        { key: "value", header: "Maximum", aggregate: "max" },
        {
          key: "value",
          header: "Weighted",
          aggregate: (_values, rows) => {
            const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
            return rows.reduce((sum, row) => sum + row.value * row.quantity, 0) / quantity;
          },
        },
      ],
      grandTotals: { rows: true, columns: false },
    });

    expect(pivot.columns.slice(1).map((column) => column.header)).toEqual([
      "FY Q2",
      "FY Q1",
    ]);
    expect(pivot.rows.map((row) => row.category)).toEqual([
      "Category B",
      "Category A",
      "Grand total",
    ]);
    expect(pivot.columns.some((column) => column.header === "Grand total")).toBe(false);
    const q1 = leafColumns(columnGroup(pivot.columns, "FY Q1").columns);
    const categoryA = pivot.rows[1];
    expect(q1.map((column) => categoryA[column.key])).toEqual([
      30,
      15,
      2,
      10,
      20,
      17.5,
    ]);
  });

  it("creates arbitrary nested column dimensions and preserves empty combinations", () => {
    const pivot = pivotData([
      { item: "Atlas", country: "India", city: "Bengaluru", revenue: 10 },
      { item: "Atlas", country: "India", city: "Chennai", revenue: 20 },
      { item: "Beacon", country: "USA", city: "Austin", revenue: 30 },
    ], {
      rows: ["item"],
      columns: ["country", "city"],
      measures: [{ key: "revenue", aggregate: "sum", chart: { type: "bar" } }],
      emptyValue: "—",
    });

    expect(pivot.columns.slice(1).map((column) => column.header)).toEqual(["India", "USA"]);
    expect(columnGroup(pivot.columns, "India").columns.map((column) => column.header))
      .toEqual(["Bengaluru", "Chennai"]);
    const indiaLeaves = leafColumns(columnGroup(pivot.columns, "India").columns);
    const usaLeaves = leafColumns(columnGroup(pivot.columns, "USA").columns);
    expect(pivot.rows[0][indiaLeaves[0].key]).toBe(10);
    expect(pivot.rows[0][usaLeaves[0].key]).toBe("—");
    expect(pivot.rows[1][indiaLeaves[0].key]).toBe("—");
    expect(usaLeaves[0].chart?.type).toBe("bar");
  });

  it("avoids generated-key collisions and renders directly through FacetTable", () => {
    const pivot = pivotData([
      { __pivot_0_0: "Atlas", city: "Bengaluru", revenue: 10 },
      { __pivot_0_0: "Beacon", city: "Bengaluru", revenue: 20 },
    ], {
      rows: ["__pivot_0_0"],
      columns: ["city"],
      measures: [{ key: "revenue", aggregate: "sum", format: "{value:,.2f}" }],
    });
    const valueColumn = leafColumns(pivot.columns)[1];
    expect(valueColumn.key).not.toBe("__pivot_0_0");

    const element = document.createElement("div");
    document.body.appendChild(element);
    new FacetTable(element, pivot);
    expect(element.querySelectorAll("thead tr")).toHaveLength(2);
    expect(element.querySelector(".facet-table-column-group-heading")?.textContent)
      .toBe("Bengaluru");
    expect([...element.querySelectorAll("tbody tr")].map((row) => row.textContent))
      .toEqual(["Atlas10.00", "Beacon20.00"]);
  });

  it("validates required fields, duplicate dimensions, and reserved row keys", () => {
    const data = [{ category: "A", city: "Bengaluru", value: 1 }];
    expect(() => pivotData(data, {
      rows: [], columns: ["city"], measures: [{ key: "value" }],
    })).toThrow(/row field/);
    expect(() => pivotData(data, {
      rows: ["category"], columns: [], measures: [{ key: "value" }],
    })).toThrow(/column field/);
    expect(() => pivotData(data, {
      rows: ["category"], columns: ["city"], measures: [],
    })).toThrow(/measure/);
    expect(() => pivotData(data, {
      rows: ["category", "category"], columns: ["city"], measures: [{ key: "value" }],
    })).toThrow(/duplicate/);
    expect(() => pivotData(data, {
      rows: ["category"], columns: ["category"], measures: [{ key: "value" }],
    })).toThrow(/both rows and columns/);
    expect(() => pivotData(
      [{ rowType: "A", city: "Bengaluru", value: 1 }],
      { rows: ["rowType"], columns: ["city"], measures: [{ key: "value" }] },
    )).toThrow(/reserved/);
    expect(() => pivotData(data, {
      rows: ["category"],
      columns: ["city"],
      measures: [{ key: "value", aggregate: "median" as "sum" }],
    })).toThrow(/unsupported aggregate/);
  });
});
