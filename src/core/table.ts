/**
 * A semantic HTML table that can mount a FacetViz chart in selected cells.
 *
 * Keeping table layout here (instead of teaching the SVG renderer about rows,
 * headers, and arbitrary text values) lets normal cells retain native table
 * accessibility while chart cells use the complete FacetViz rendering API.
 */

import { FacetViz } from "./chart.js";
import type { ChartOptions, ChartType, PointInput, SeriesOptions } from "./options.js";
import { formatString, merge } from "./utils.js";

/** Any object whose named properties can be used as table columns. */
export type FacetTableRow = object;

/** Optional metadata fields recognized on pre-grouped table rows. */
export interface FacetTableRowMetadata {
  /** Marks a supplied row for detail, subtotal, or grand-total behavior and styling. */
  rowType?: "detail" | "subtotal" | "grandTotal";
  /** Identifies the detail group whose rows may be sorted together. */
  groupPath?: ReadonlyArray<unknown>;
}

/** CSS properties accepted by each top-level table style slot. */
export type FacetTableStyle = Record<string, string | number>;

/** A row value with content decoration and CSS scoped to one table cell. */
export interface FacetTableCellDescriptor<Value = unknown> {
  [property: string]: unknown;
  /** Raw value used by formatting, sorting, filtering, and cell charts. */
  value: Value;
  /** Text inserted before a normal formatted value. */
  prefix?: string | number;
  /** Text inserted after a normal formatted value. */
  suffix?: string | number;
  /** Optional nested CSS map; direct CSS properties on this object also work. */
  style?: FacetTableStyle;
}

export type FacetTableColumnStyle<Row extends FacetTableRow> =
  | FacetTableStyle
  | ((value: unknown, row: Row, rowIndex: number) => FacetTableStyle);

export interface FacetTableStyleOptions<Row extends FacetTableRow> {
  root?: FacetTableStyle;
  table?: FacetTableStyle;
  caption?: FacetTableStyle;
  head?: FacetTableStyle;
  headerRow?: FacetTableStyle;
  headerCell?: FacetTableStyle;
  /** Style header cells that contain nested child columns. */
  columnGroupHeader?: FacetTableStyle;
  sortButton?: FacetTableStyle;
  sortIndicator?: FacetTableStyle;
  headerControls?: FacetTableStyle;
  filterButton?: FacetTableStyle;
  activeFilterButton?: FacetTableStyle;
  filterIndicator?: FacetTableStyle;
  filterPanel?: FacetTableStyle;
  filterInput?: FacetTableStyle;
  filterActions?: FacetTableStyle;
  filterActionButton?: FacetTableStyle;
  body?: FacetTableStyle;
  /** Static row style, or a callback for stripes/conditional formatting. */
  row?: FacetTableStyle | ((row: Row, rowIndex: number) => FacetTableStyle);
  /** Style supplied rows whose `rowType` is `subtotal`. */
  subtotalRow?: FacetTableStyle;
  /** Style supplied rows whose `rowType` is `grandTotal`. */
  grandTotalRow?: FacetTableStyle;
  /** Static cell style, or a callback that can inspect the cell value. */
  cell?:
    | FacetTableStyle
    | ((value: unknown, row: Row, rowIndex: number, column: FacetTableColumn<Row>) => FacetTableStyle);
  valueCell?: FacetTableStyle;
  chartCell?: FacetTableStyle;
  chartHost?: FacetTableStyle;
  emptyCell?: FacetTableStyle;
  pagination?: FacetTableStyle;
  paginationInfo?: FacetTableStyle;
  paginationButton?: FacetTableStyle;
  activePageButton?: FacetTableStyle;
  pageSizeLabel?: FacetTableStyle;
  pageSizeSelect?: FacetTableStyle;
}

export type FacetTableSortDirection = "asc" | "desc";

/** SVG path data for each sort state, drawn filled in place of the default arrows. */
export interface FacetTableSortIndicatorPaths {
  /** Paths per state; `none` is the unsorted column. */
  paths: { asc: string[]; desc: string[]; none: string[] };
  /** Coordinate system of the paths. Default `0 0 14 14`. */
  viewBox?: string;
  /** Rendered width and height in pixels. Default `16`. */
  size?: number;
  /** Opacity of an unsorted column's icon. Default `0.5`. */
  unsortedOpacity?: number;
}

/**
 * Replaces the header sort icon: path data (JSON-safe), or a function that
 * returns the element for a direction (`undefined` when unsorted). The table
 * still adds its class, `data-direction`, `aria-hidden`, and `style.sortIndicator`.
 */
export type FacetTableSortIndicator =
  | FacetTableSortIndicatorPaths
  | ((direction: FacetTableSortDirection | undefined) => Element);

export interface FacetTableColumnSortOptions<Row extends FacetTableRow> {
  /** Apply this sort when the table is first created. */
  initialDirection?: FacetTableSortDirection;
  /** Custom comparison for formatted strings or domain-specific values. */
  compare?: (
    a: unknown,
    b: unknown,
    rowA: Row,
    rowB: Row,
  ) => number;
}

export interface FacetTableSortState<Row extends FacetTableRow> {
  key: keyof Row & string;
  direction: FacetTableSortDirection;
}

export interface FacetTableColumnFilterOptions<Row extends FacetTableRow> {
  /** Filter value applied when the table is first created. */
  initialValue?: string;
  /** Placeholder shown in the header filter input. */
  placeholder?: string;
  /** Override the default case-insensitive text containment check. */
  predicate?: (
    value: unknown,
    filterValue: string,
    row: Row,
    rowIndex: number,
  ) => boolean;
}

export interface FacetTableFilterState<Row extends FacetTableRow> {
  key: keyof Row & string;
  value: string;
}

export interface FacetTablePaginationLabels {
  first?: string;
  previous?: string;
  next?: string;
  last?: string;
  page?: string;
  of?: string;
  rows?: string;
  perPage?: string;
}

export interface FacetTablePaginationOptions {
  /** Enable/disable pagination when an options object is supplied. Default `true`. */
  enabled?: boolean;
  /** Number of rows rendered at once. Default `25`. */
  pageSize?: number;
  /** Initial 1-based page. Later changes can use `setPage()`. Default `1`. */
  page?: number;
  /** Values offered by the page-size selector. Default `[10, 25, 50, 100]`. */
  pageSizeOptions?: number[];
  /** Show the page-size selector. Default `true`. */
  showPageSize?: boolean;
  /** Show numbered page buttons between previous and next. Default `true`. */
  showPageNumbers?: boolean;
  /** Maximum numbered page buttons shown at once. Default `5`. */
  maxPageButtons?: number;
  /** Keep controls visible even when all rows fit on one page. Default `false`. */
  alwaysShow?: boolean;
  align?: "left" | "center" | "right";
  labels?: FacetTablePaginationLabels;
  onPageChange?: (page: number, pageSize: number) => void;
}

export type FacetTableRowDensity =
  | "responsive"
  | "compact"
  | "cozy"
  | "crazy"
  | "comfortable";

export interface FacetTableLayoutOptions {
  /** CSS table-layout algorithm. Default `auto`. */
  tableLayout?: "auto" | "fixed";
  /** Responsive uses CSS clamp(); `crazy` is accepted as an alias for `cozy`. */
  rowDensity?: FacetTableRowDensity;
  bodyTextSize?: number | string;
  showHeaderRow?: boolean;
  wrapText?: boolean;
  freezeHeaderRow?: boolean;
  freezeFirstColumn?: boolean;
}

export interface FacetTableHeaderAppearance {
  fillColor?: string;
  textColor?: string;
  textSize?: number | string;
  alignment?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
}

export interface FacetTableRowsAndColumnsAppearance {
  textColor?: string;
  rowFill?: string;
  dimensionAlignment?: "left" | "center" | "right";
  valueAlignment?: "left" | "center" | "right";
  displayEmptyCellAs?: string;
  bandedRows?: boolean;
  bandedRowsAlternateColor?: string;
  bandedColumns?: boolean;
  bandedColumnsAlternateColor?: string;
  emphasizeFirstColumn?: boolean;
  emphasizeLastColumn?: boolean;
  highlightRowOnHover?: boolean;
  hoverColor?: string;
}

export interface FacetTableBorderAppearance {
  horizontalBorders?: boolean;
  verticalBorders?: boolean;
  outsideBorder?: boolean;
  borderColor?: string;
  borderWidth?: number | string;
}

export interface FacetTableAppearanceOptions {
  headerRow?: FacetTableHeaderAppearance;
  rowsAndColumns?: FacetTableRowsAndColumnsAppearance;
  borders?: FacetTableBorderAppearance;
}

export type FacetTableCellFormatter<Row extends FacetTableRow> = (
  value: unknown,
  row: Row,
  rowIndex: number,
) => string | Node;

export interface FacetTableCellChartOptions<Row extends FacetTableRow> {
  /** Chart renderer used in this column. Default `sparkline`. */
  type?: ChartType;
  /** Cell chart height in pixels. Default `44`. */
  height?: number;
  /** Minimum width reserved for the chart host. Default `120`. */
  minWidth?: number;
  /**
   * `shared` gives every chart in this column the same value-axis domain,
   * making magnitudes comparable between rows. Default `independent`.
   */
  scale?: "independent" | "shared";
  /**
   * Base chart options applied to every cell in this column, or a function
   * giving each cell's own (its categories, type, colors…).
   */
  options?:
    | Omit<ChartOptions, "series">
    | ((value: unknown, row: Row, rowIndex: number) => Omit<ChartOptions, "series">);
  /**
   * Build one or more series from the cell value. Use `"value"` when the cell
   * already contains a `SeriesOptions[]`, which also works in data-only JSON.
   * When omitted, the value is treated as a `PointInput[]` (or one scalar point).
   */
  series?:
    | "value"
    | ((
        value: unknown,
        row: Row,
        rowIndex: number,
      ) => SeriesOptions[]);
}

export interface FacetTableColumn<Row extends FacetTableRow> {
  /** Property read from each row. */
  key: keyof Row & string;
  /** Visible column heading. Defaults to `key`. */
  header?: string;
  /** Column width, as pixels or any CSS width string. */
  width?: number | string;
  /**
   * A handle on the heading's right edge drags the column wider or narrower
   * (arrow keys too, once it has focus); the table then keeps that width.
   * `onColumnResize` hears the width picked.
   */
  resizable?: boolean;
  /** The narrowest a resizable column drags to, px. Default `40`. */
  minResizeWidth?: number;
  /** Horizontal cell alignment. `align` remains as a backwards-compatible alias. */
  horizontalAlign?: "left" | "center" | "right";
  align?: "left" | "center" | "right";
  /** Vertical alignment for heading, value, and chart cells. Default `middle`. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** Used by dimension/value alignment; inferred from the value when omitted. */
  role?: "dimension" | "value";
  /** Style every body cell in this column, optionally based on its raw value. */
  style?: FacetTableColumnStyle<Row>;
  /** Style this column's header cell. */
  headerStyle?: FacetTableStyle;
  /** Add an interactive sorting control to this column header. */
  sortable?: boolean | FacetTableColumnSortOptions<Row>;
  /** Add a filter control to this column header. */
  filterable?: boolean | FacetTableColumnFilterOptions<Row>;
  /** Declarative value format, e.g. `{value:$,.0f}` or `{row.product}: {value}`. */
  format?: string;
  /** Format a normal value cell. Ignored for chart cells. */
  formatter?: FacetTableCellFormatter<Row>;
  /** When present, this column renders a chart for every row. */
  chart?: FacetTableCellChartOptions<Row>;
}

/** A header that spans one or more nested leaf columns. */
export interface FacetTableColumnGroup<Row extends FacetTableRow> {
  /** Visible heading for this group. */
  header: string;
  /** Child groups or leaf columns. Empty groups are not allowed. */
  columns: FacetTableColumnDefinition<Row>[];
  /** Horizontal group-heading alignment. Default `center`. */
  horizontalAlign?: "left" | "center" | "right";
  /** Backwards-compatible alias for `horizontalAlign`. */
  align?: "left" | "center" | "right";
  /** Vertical group-heading alignment. Default `middle`. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** Style this group header cell. */
  headerStyle?: FacetTableStyle;
}

/** A leaf data column or a recursively nested header group. */
export type FacetTableColumnDefinition<Row extends FacetTableRow> =
  | FacetTableColumn<Row>
  | FacetTableColumnGroup<Row>;

export interface FacetTableOptions<Row extends FacetTableRow> {
  rows: Row[];
  columns: FacetTableColumnDefinition<Row>[];
  caption?: string;
  className?: string;
  /** Structural layout and responsive table behavior. */
  layout?: FacetTableLayoutOptions;
  emptyText?: string;
  /** Top-level visual overrides for every structural part of the table. */
  style?: FacetTableStyleOptions<Row>;
  /** Semantic header, row/column, and border appearance controls. */
  appearance?: FacetTableAppearanceOptions;
  /** `true` uses defaults; an object customizes paging; omitted/false disables it. */
  pagination?: boolean | FacetTablePaginationOptions;
  /** Custom header sort icon. Defaults to stroked arrows. */
  sortIndicator?: FacetTableSortIndicator;
  /**
   * A body row was clicked (or chosen with Enter or Space): its data and its
   * index in `rows`. With it, rows show a pointer and take keyboard focus.
   */
  onRowClick?: (row: Row, rowIndex: number, event: MouseEvent | KeyboardEvent) => void;
  /** A resizable column was dragged (or stepped by keys) to `width` px. */
  onColumnResize?: (key: string, width: number) => void;
  /** A header click changed the sort; `undefined` when it went back to the
   * rows' own order. Not called by `sortBy()` / `clearSort()`. */
  onSortChange?: (sort: FacetTableSortState<Row> | undefined) => void;
}

interface PendingChart<Row extends FacetTableRow> {
  host: HTMLDivElement;
  column: FacetTableColumn<Row>;
  columnIndex: number;
  value: unknown;
  row: Row;
  rowIndex: number;
  series: SeriesOptions[];
}

/** Render value columns and compact charts together in one table. */
export class FacetTable<Row extends FacetTableRow = FacetTableRow> {
  readonly container: HTMLElement;
  readonly charts: FacetViz[] = [];
  private options: FacetTableOptions<Row>;
  private flattenedColumns: FacetTableColumn<Row>[] = [];
  private root?: HTMLDivElement;
  private table?: HTMLTableElement;
  private resizeObserver?: ResizeObserver;
  private resizeFrame?: number;
  /** Each chart column's chart hosts, by column key, for live resizing. */
  private chartHosts = new Map<string, HTMLDivElement[]>();
  private currentPage = 1;
  private currentPageSize = 25;
  private currentSort?: FacetTableSortState<Row>;
  private currentFilters = new Map<keyof Row & string, string>();
  private filteredRowCache?: Array<{ row: Row; rowIndex: number }>;
  private sortedRowCache?: Array<{ row: Row; rowIndex: number }>;
  private sharedDomainCache?: Map<number, [number, number]>;
  private destroyed = false;

  constructor(container: HTMLElement | string, options: FacetTableOptions<Row>) {
    const element =
      typeof container === "string"
        ? document.querySelector(container)
        : container;
    if (!element) throw new Error("FacetTable: container element not found");
    validateTableColumns(options.columns);
    this.container = element as HTMLElement;
    this.options = { ...options, rows: [...options.rows], columns: [...options.columns] };
    this.flattenedColumns = flattenTableColumns(this.options.columns);
    const columns = this.flattenedColumns;
    this.currentSort = initialSort(columns);
    this.currentFilters = initialFilters(columns);
    this.syncPagination(options.pagination, true);
    this.render();
    this.setupReflow();
  }

  /** Replace all table rows and their cell charts. */
  setRows(rows: Row[]): void {
    if (this.destroyed) return;
    this.options = { ...this.options, rows: [...rows] };
    this.invalidateProcessedRows();
    this.clampPage();
    this.render();
  }

  /** Merge table-level options and rebuild the affected cells. */
  update(options: Partial<FacetTableOptions<Row>>): void {
    if (this.destroyed) return;
    const next = {
      ...this.options,
      ...options,
      rows: options.rows ? [...options.rows] : this.options.rows,
      columns: options.columns ? [...options.columns] : this.options.columns,
    };
    validateTableColumns(next.columns);
    this.options = next;
    this.flattenedColumns = flattenTableColumns(this.options.columns);
    if (options.rows !== undefined || options.columns !== undefined)
      this.invalidateProcessedRows();
    if (options.pagination !== undefined)
      this.syncPagination(options.pagination, false);
    if (options.columns !== undefined) {
      const columns = flattenTableColumns(this.options.columns);
      const currentColumn = this.currentSort
        ? columns.find((column) => column.key === this.currentSort?.key)
        : undefined;
      if (!currentColumn?.sortable)
        this.currentSort = initialSort(columns);
      this.currentFilters = reconcileFilters(
        this.currentFilters,
        columns,
      );
    }
    this.clampPage();
    this.render();
  }

  /** Current 1-based page (always `1` when pagination is disabled). */
  get page(): number {
    return this.paginationOptions() ? this.currentPage : 1;
  }

  get pageSize(): number {
    return this.currentPageSize;
  }

  get pageCount(): number {
    if (!this.paginationOptions()) return 1;
    return Math.max(1, Math.ceil(this.filteredRows().length / this.currentPageSize));
  }

  get sort(): FacetTableSortState<Row> | undefined {
    return this.currentSort ? { ...this.currentSort } : undefined;
  }

  get filters(): FacetTableFilterState<Row>[] {
    return [...this.currentFilters].map(([key, value]) => ({ key, value }));
  }

  private leafColumns(): FacetTableColumn<Row>[] {
    return this.flattenedColumns;
  }

  setFilter(key: keyof Row & string, value?: string): void {
    if (this.destroyed) return;
    const column = this.leafColumns().find((candidate) => candidate.key === key);
    if (!column?.filterable)
      throw new Error(`FacetTable.setFilter(): column "${key}" is not filterable.`);
    const normalized = value?.trim() ?? "";
    if (normalized) this.currentFilters.set(key, normalized);
    else this.currentFilters.delete(key);
    this.currentPage = 1;
    this.invalidateFilteredRows();
    this.render();
  }

  clearFilter(key: keyof Row & string): void {
    if (this.destroyed || !this.currentFilters.has(key)) return;
    this.currentFilters.delete(key);
    this.currentPage = 1;
    this.invalidateFilteredRows();
    this.render();
  }

  clearFilters(): void {
    if (this.destroyed || !this.currentFilters.size) return;
    this.currentFilters.clear();
    this.currentPage = 1;
    this.invalidateFilteredRows();
    this.render();
  }

  sortBy(
    key: keyof Row & string,
    direction: FacetTableSortDirection = "asc",
  ): void {
    if (this.destroyed) return;
    const column = this.leafColumns().find((candidate) => candidate.key === key);
    if (!column?.sortable)
      throw new Error(`FacetTable.sortBy(): column "${key}" is not sortable.`);
    this.currentSort = { key, direction };
    this.currentPage = 1;
    this.sortedRowCache = undefined;
    this.render();
  }

  clearSort(): void {
    if (this.destroyed || !this.currentSort) return;
    this.currentSort = undefined;
    this.currentPage = 1;
    this.sortedRowCache = undefined;
    this.render();
  }

  setPage(page: number): void {
    if (this.destroyed || !this.paginationOptions()) return;
    const next = clampInteger(page, 1, this.pageCount, "FacetTable.setPage(): page");
    if (next === this.currentPage) return;
    this.currentPage = next;
    this.render();
    this.paginationOptions()?.onPageChange?.(this.currentPage, this.currentPageSize);
  }

  setPageSize(pageSize: number): void {
    if (this.destroyed || !this.paginationOptions()) return;
    const next = positiveInteger(pageSize, "FacetTable.setPageSize(): pageSize");
    if (next === this.currentPageSize) return;
    this.currentPageSize = next;
    this.currentPage = 1;
    this.render();
    this.paginationOptions()?.onPageChange?.(this.currentPage, this.currentPageSize);
  }

  /** Re-measure all mounted cell charts after an outer layout change. */
  reflow(): void {
    if (this.destroyed) return;
    if (this.options.layout?.freezeHeaderRow) this.positionStickyHeaderRows();
    this.charts.forEach((chart) => chart.reflow());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyCharts();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.resizeFrame !== undefined) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = undefined;
    this.root?.remove();
    this.root = undefined;
    this.table = undefined;
  }

  private render(): void {
    this.chartHosts.clear();
    this.destroyCharts();
    this.clampPage();

    const root = document.createElement("div");
    root.className = "facet-table-root";
    root.style.width = "100%";
    const layout = this.options.layout;
    if (layout?.freezeHeaderRow || layout?.freezeFirstColumn)
      root.style.overflow = "auto";
    applyStyle(root, this.options.style?.root);

    const table = document.createElement("table");
    table.className = ["facet-table", this.options.className]
      .filter(Boolean)
      .join(" ");
    table.style.width = "100%";
    table.style.height = "100%";
    const needsStickyLayout =
      layout?.freezeHeaderRow || layout?.freezeFirstColumn;
    table.style.borderCollapse = needsStickyLayout ? "separate" : "collapse";
    if (needsStickyLayout) table.style.borderSpacing = "0";
    table.style.tableLayout = layout?.tableLayout ?? "auto";
    const borders = this.options.appearance?.borders;
    if (borders?.outsideBorder) {
      table.style.borderStyle = "solid";
      table.style.borderColor = borders.borderColor ?? "#e5e7eb";
      table.style.borderWidth = cssLength(borders.borderWidth ?? 1);
    }
    applyStyle(table, this.options.style?.table);

    if (this.options.caption) {
      const caption = document.createElement("caption");
      caption.textContent = this.options.caption;
      caption.style.textAlign = "left";
      caption.style.padding = "0 0 8px";
      applyStyle(caption, this.options.style?.caption);
      table.appendChild(caption);
    }

    if (layout?.showHeaderRow !== false)
      table.appendChild(this.renderHead());
    const { body, pending } = this.renderBody();
    table.appendChild(body);
    root.appendChild(table);
    const pagination = this.renderPagination();
    if (pagination) root.appendChild(pagination);
    this.container.replaceChildren(root);
    this.root = root;
    this.table = table;
    if (layout?.freezeHeaderRow) this.positionStickyHeaderRows();

    const sharedDomains = this.sharedDomainCache ?? this.sharedDomains();
    this.sharedDomainCache = sharedDomains;
    for (const item of pending) {
      const domain = sharedDomains.get(item.columnIndex);
      this.charts.push(this.mountChart(item, domain));
    }
  }

  private renderHead(): HTMLTableSectionElement {
    const head = document.createElement("thead");
    applyStyle(head, this.options.style?.head);
    const depth = tableColumnDepth(this.options.columns);
    const rows = Array.from({ length: depth }, () => {
      const row = document.createElement("tr");
      applyStyle(row, this.options.style?.headerRow);
      head.appendChild(row);
      return row;
    });
    let leafIndex = 0;

    const renderColumns = (
      definitions: FacetTableColumnDefinition<Row>[],
      level: number,
    ): void => {
      for (const definition of definitions) {
        if (isTableColumnGroup(definition)) {
          const count = tableColumnLeafCount(definition);
          rows[level].appendChild(
            this.renderColumnGroupHeading(definition, leafIndex, count, level),
          );
          renderColumns(definition.columns, level + 1);
          continue;
        }
        const rowSpan = depth - level;
        rows[level].appendChild(
          this.renderLeafColumnHeading(definition, leafIndex, rowSpan, level),
        );
        leafIndex++;
      }
    };

    renderColumns(this.options.columns, 0);
    return head;
  }

  /** A handle on a heading's right edge that drags its column's width. */
  private addResizeHandle(cell: HTMLTableCellElement, column: FacetTableColumn<Row>): void {
    const min = column.minResizeWidth ?? 40;
    cell.style.position = "relative";
    const handle = document.createElement("div");
    handle.className = "facet-table-resize-handle";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", `Resize ${column.header ?? column.key}`);
    // A focusable separator is a widget with a value: the column's width.
    const showWidth = (w: number) => handle.setAttribute("aria-valuenow", String(Math.round(w)));
    handle.setAttribute("aria-valuemin", String(min));
    showWidth(typeof column.width === "number" ? column.width : min);
    handle.addEventListener("focus", () => showWidth(cell.getBoundingClientRect().width || min));
    handle.tabIndex = 0;
    Object.assign(handle.style, {
      position: "absolute",
      top: "0",
      // Inside the heading: a last column's would be clipped by the table.
      right: "0",
      bottom: "0",
      width: "8px",
      cursor: "col-resize",
      zIndex: "2",
      touchAction: "none",
    });
    const line = document.createElement("div");
    Object.assign(line.style, { position: "absolute", top: "20%", bottom: "20%", right: "0", width: "2px", borderRadius: "1px", background: "currentColor", opacity: "0" });
    handle.appendChild(line);
    handle.addEventListener("mouseenter", () => (line.style.opacity = "0.35"));
    handle.addEventListener("mouseleave", () => (line.style.opacity = "0"));

    const setWidth = (width: number) => {
      showWidth(width);
      cell.style.width = `${width}px`;
      cell.style.minWidth = `${width}px`;
      cell.style.maxWidth = `${width}px`;
      // Its charts follow; they're drawn again at the new width once done.
      for (const host of this.chartHosts.get(column.key) ?? []) {
        host.style.minWidth = "0";
        host.style.overflow = "hidden";
      }
    };
    const finish = (width: number) => {
      column.width = width;
      this.render();
      this.options.onColumnResize?.(column.key, width);
    };
    // Clicks on the handle don't sort the column.
    handle.addEventListener("click", (e) => e.stopPropagation());
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const start = e.clientX;
      const from = cell.getBoundingClientRect().width;
      let width = from;
      handle.setPointerCapture?.(e.pointerId);
      line.style.opacity = "0.6";
      const move = (ev: PointerEvent) => {
        width = Math.max(min, Math.round(from + ev.clientX - start));
        setWidth(width);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        if (width !== from) finish(width);
        else line.style.opacity = "0";
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 50 : 10;
      const from = Math.round(cell.getBoundingClientRect().width);
      finish(Math.max(min, from + (e.key === "ArrowRight" ? step : -step)));
      // Focus stays on the handle as the table is drawn again.
      this.root?.querySelectorAll<HTMLElement>(".facet-table-resize-handle").forEach((h) => {
        if (h.getAttribute("aria-label") === handle.getAttribute("aria-label")) h.focus();
      });
    });
    cell.appendChild(handle);
  }

  private renderLeafColumnHeading(
    column: FacetTableColumn<Row>,
    columnIndex: number,
    rowSpan: number,
    level: number,
  ): HTMLTableCellElement {
    const cell = document.createElement("th");
    cell.setAttribute("scope", "col");
    cell.rowSpan = rowSpan;
    cell.dataset.headerLevel = String(level);
    cell.className = column.chart
      ? "facet-table-heading facet-table-chart-heading"
      : "facet-table-heading";
    this.styleCell(cell, column, true, undefined, columnIndex);
    this.applyColumnStyle(cell, column, true);
    if (column.sortable || column.filterable) {
      const controls = document.createElement("div");
      controls.className = "facet-table-header-controls";
      controls.style.display = "flex";
      controls.style.alignItems = "center";
      controls.style.gap = "5px";
      controls.style.width = "100%";
      applyStyle(controls, this.options.style?.headerControls);

      if (column.sortable) {
        const direction = this.currentSort?.key === column.key
          ? this.currentSort.direction
          : undefined;
        cell.setAttribute(
          "aria-sort",
          direction === "asc"
            ? "ascending"
            : direction === "desc"
              ? "descending"
              : "none",
        );

        const button = document.createElement("button");
        button.type = "button";
        button.className = "facet-table-sort-button";
        button.style.display = "inline-flex";
        button.style.alignItems = "center";
        button.style.justifyContent = sortAlignment(
          this.cellHorizontalAlignment(column, true),
        );
        button.style.gap = "5px";
        button.style.flex = "1 1 auto";
        button.style.minWidth = "0";
        button.style.padding = "0";
        button.style.border = "0";
        button.style.background = "transparent";
        button.style.color = "inherit";
        button.style.font = "inherit";
        button.style.cursor = "pointer";
        button.append(document.createTextNode(column.header ?? column.key));
        applyStyle(button, this.options.style?.sortButton);

        const indicator = createSortIndicator(direction, this.options.sortIndicator);
        indicator.setAttribute("class", "facet-table-sort-indicator");
        indicator.setAttribute("aria-hidden", "true");
        if (indicator instanceof HTMLElement || indicator instanceof SVGElement)
          indicator.dataset.direction = direction ?? "none";
        applyStyle(indicator as HTMLElement | SVGElement, this.options.style?.sortIndicator);
        button.appendChild(indicator);
        button.addEventListener("click", () => this.toggleSort(column));
        controls.appendChild(button);
      } else {
        const label = document.createElement("span");
        label.className = "facet-table-heading-label";
        label.textContent = column.header ?? column.key;
        label.style.flex = "1 1 auto";
        label.style.minWidth = "0";
        controls.appendChild(label);
      }

      if (column.filterable) {
        if (!cell.style.position) cell.style.position = "relative";
        controls.appendChild(this.renderFilterControl(column, columnIndex));
      }
      cell.appendChild(controls);
    } else {
      cell.textContent = column.header ?? column.key;
    }
    // Last: the heading's text, set above, would clear it.
    if (column.resizable) this.addResizeHandle(cell, column);
    return cell;
  }

  private renderColumnGroupHeading(
    group: FacetTableColumnGroup<Row>,
    columnIndex: number,
    colSpan: number,
    level: number,
  ): HTMLTableCellElement {
    const cell = document.createElement("th");
    cell.setAttribute("scope", "colgroup");
    cell.colSpan = colSpan;
    cell.dataset.headerLevel = String(level);
    cell.className = "facet-table-heading facet-table-column-group-heading";
    cell.textContent = group.header;
    this.styleColumnGroupHeading(cell, group, columnIndex, colSpan);
    return cell;
  }
  private renderFilterControl(
    column: FacetTableColumn<Row>,
    columnIndex: number,
  ): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "facet-table-filter";
    wrapper.style.display = "inline-flex";
    wrapper.style.position = "relative";
    wrapper.style.flex = "0 0 auto";

    const activeValue = this.currentFilters.get(column.key) ?? "";
    const panelId = `facet-table-filter-${columnIndex}-${filterIdCounter++}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "facet-table-filter-button";
    button.classList.toggle("is-active", !!activeValue);
    button.dataset.active = String(!!activeValue);
    button.setAttribute("aria-label", `Filter ${column.header ?? column.key}`);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", panelId);
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.width = "24px";
    button.style.height = "24px";
    button.style.padding = "3px";
    button.style.border = "0";
    button.style.borderRadius = "4px";
    button.style.background = activeValue
      ? "var(--facet-table-filter-active-background, #eef2ff)"
      : "transparent";
    button.style.color = activeValue
      ? "var(--facet-table-filter-active-color, #4f46e5)"
      : "inherit";
    button.style.cursor = "pointer";
    applyStyle(button, this.options.style?.filterButton);
    if (activeValue) applyStyle(button, this.options.style?.activeFilterButton);

    const indicator = createFilterIndicator();
    indicator.setAttribute("class", "facet-table-filter-indicator");
    applyStyle(indicator, this.options.style?.filterIndicator);
    button.appendChild(indicator);

    const panel = document.createElement("form");
    panel.id = panelId;
    panel.className = "facet-table-filter-panel";
    panel.hidden = true;
    panel.style.position = "absolute";
    panel.style.top = "calc(100% + 5px)";
    panel.style.right = "0";
    panel.style.zIndex = "20";
    panel.style.width = "220px";
    panel.style.padding = "8px";
    panel.style.border = "1px solid var(--facet-table-border-color, #d1d5db)";
    panel.style.borderRadius = "6px";
    panel.style.background = "var(--facet-table-filter-background, Canvas)";
    panel.style.color = "var(--facet-table-filter-color, CanvasText)";
    panel.style.fontWeight = "400";
    panel.style.fontStyle = "normal";
    panel.style.textAlign = "left";
    panel.style.textTransform = "none";
    panel.style.letterSpacing = "normal";
    panel.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.16)";
    applyStyle(panel, this.options.style?.filterPanel);

    const filterOptions = typeof column.filterable === "object"
      ? column.filterable
      : undefined;
    const input = document.createElement("input");
    input.type = "search";
    input.className = "facet-table-filter-input";
    input.value = activeValue;
    input.placeholder = filterOptions?.placeholder ?? "Filter…";
    input.setAttribute("aria-label", `Filter value for ${column.header ?? column.key}`);
    input.style.width = "100%";
    input.style.padding = "6px 8px";
    input.style.border = "1px solid var(--facet-table-border-color, #d1d5db)";
    input.style.borderRadius = "4px";
    input.style.background = "var(--facet-table-filter-input-background, Canvas)";
    input.style.color = "inherit";
    input.style.font = "inherit";
    applyStyle(input, this.options.style?.filterInput);
    panel.appendChild(input);

    const actions = document.createElement("span");
    actions.className = "facet-table-filter-actions";
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "6px";
    actions.style.marginTop = "8px";
    applyStyle(actions, this.options.style?.filterActions);
    const clear = filterActionButton("Clear", this.options.style?.filterActionButton);
    const apply = filterActionButton("Apply", this.options.style?.filterActionButton);
    apply.type = "submit";
    apply.style.background = "var(--facet-table-filter-apply-background, #4f46e5)";
    apply.style.color = "var(--facet-table-filter-apply-color, #fff)";
    actions.append(clear, apply);
    panel.appendChild(actions);

    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) input.focus();
    });
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      this.setFilter(column.key, input.value);
    });
    clear.addEventListener("click", () => {
      input.value = "";
      if (this.currentFilters.has(column.key)) this.clearFilter(column.key);
      else {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.focus();
    });

    wrapper.append(button, panel);
    return wrapper;
  }

  private renderBody(): {
    body: HTMLTableSectionElement;
    pending: PendingChart<Row>[];
  } {
    const body = document.createElement("tbody");
    const bodyTextSize = this.options.layout?.bodyTextSize;
    if (bodyTextSize !== undefined) body.style.fontSize = cssLength(bodyTextSize);
    applyStyle(body, this.options.style?.body);
    const pending: PendingChart<Row>[] = [];
    const columns = this.leafColumns();

    const visibleRows = this.visibleRows();
    if (!visibleRows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = columns.length;
      cell.textContent = this.options.emptyText ?? "No data";
      cell.className = "facet-table-empty";
      cell.style.padding = "12px 10px";
      cell.style.textAlign = "center";
      applyStyle(cell, this.options.style?.emptyCell);
      row.appendChild(cell);
      body.appendChild(row);
      return { body, pending };
    }

    visibleRows.forEach(({ row: dataRow, rowIndex }, visibleRowIndex) => {
      const row = document.createElement("tr");
      const rowType = tableRowType(dataRow);
      row.className = [
        "facet-table-row",
        rowType
          ? `facet-table-row-${rowType === "grandTotal" ? "grand-total" : rowType}`
          : "",
      ].filter(Boolean).join(" ");
      if (rowType) row.dataset.rowType = rowType;
      const rowBackground = this.customizedRowBackground(visibleRowIndex);
      if (rowBackground) row.style.backgroundColor = rowBackground;
      const summaryStyle = this.summaryRowStyle(rowType);
      applyStyle(row, summaryStyle);
      const rowStyle = resolveRowStyle(this.options.style?.row, dataRow, rowIndex);
      applyStyle(row, rowStyle);
      const onRowClick = this.options.onRowClick;
      if (onRowClick && !rowType) {
        row.classList.add("facet-table-row-clickable");
        row.style.cursor = "pointer";
        row.tabIndex = 0;
        row.addEventListener("click", (event) => onRowClick(dataRow, rowIndex, event));
        row.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onRowClick(dataRow, rowIndex, event);
        });
      }
      for (const [columnIndex, column] of columns.entries()) {
        const cell = document.createElement("td");
        const sourceValue = dataRow[column.key];
        const descriptor = resolveCellDescriptor(sourceValue);
        const value = descriptor ? descriptor.value : sourceValue;
        cell.className = column.chart
          ? "facet-table-cell facet-table-chart-cell"
          : "facet-table-cell";
        this.styleCell(cell, column, false, value, columnIndex);
        this.styleBodyCell(
          cell,
          columnIndex,
          row.style.backgroundColor || rowBackground,
        );
        applyStyle(cell, summaryStyle);
        applyStyle(
          cell,
          resolveCellStyle(this.options.style?.cell, value, dataRow, rowIndex, column),
        );
        applyStyle(
          cell,
          column.chart
            ? this.options.style?.chartCell
            : this.options.style?.valueCell,
        );
        applyStyle(cell, rowStyle);
        this.applyColumnStyle(cell, column, false, value, dataRow, rowIndex);
        applyStyle(cell, descriptorStyle(descriptor));

        if (column.chart) {
          const host = document.createElement("div");
          host.className = "facet-table-chart";
          host.style.width = "100%";
          host.style.height = `${column.chart.height ?? (typeof column.chart.options === "function" ? undefined : column.chart.options?.chart?.height) ?? 44}px`;
          // A column resized to a width: its charts fit it, however narrow.
          host.style.minWidth = column.resizable && typeof column.width === "number" ? "0" : `${column.chart.minWidth ?? 120}px`;
          applyStyle(host, this.options.style?.chartHost);
          cell.appendChild(host);
          const hosts = this.chartHosts.get(column.key) ?? [];
          hosts.push(host);
          this.chartHosts.set(column.key, hosts);
          pending.push({
            host,
            column,
            columnIndex,
            value,
            row: dataRow,
            rowIndex,
            series: this.cellSeries(column, value, dataRow, rowIndex),
          });
        } else {
          this.renderValue(cell, column, value, dataRow, rowIndex, descriptor);
        }
        row.appendChild(cell);
      }
      this.bindRowHover(row);
      body.appendChild(row);
    });
    return { body, pending };
  }

  private summaryRowStyle(
    rowType: FacetTableRowMetadata["rowType"],
  ): FacetTableStyle | undefined {
    if (!rowType || rowType === "detail") return undefined;
    if (rowType === "grandTotal") {
      return {
        backgroundColor:
          "var(--facet-table-grand-total-background, color-mix(in srgb, Canvas 88%, #6366f1 12%))",
        fontWeight: 700,
        borderTop:
          "1px solid var(--facet-table-grand-total-border, color-mix(in srgb, CanvasText 24%, transparent))",
        ...this.options.style?.grandTotalRow,
      };
    }
    return {
      backgroundColor:
        "var(--facet-table-subtotal-background, color-mix(in srgb, Canvas 94%, #6366f1 6%))",
      fontWeight: 700,
      ...this.options.style?.subtotalRow,
    };
  }

  private visibleRows(): Array<{ row: Row; rowIndex: number }> {
    const rows = this.sortedRows();
    const pagination = this.paginationOptions();
    const start = pagination
      ? (this.currentPage - 1) * this.currentPageSize
      : 0;
    const end = pagination
      ? Math.min(rows.length, start + this.currentPageSize)
      : rows.length;
    return rows.slice(start, end);
  }

  private sortedRows(): Array<{ row: Row; rowIndex: number }> {
    const filteredRows = this.filteredRows();
    if (!this.currentSort) return filteredRows;
    if (this.sortedRowCache) return this.sortedRowCache;
    const rows = [...filteredRows];
    const column = this.leafColumns().find(
      (candidate) => candidate.key === this.currentSort?.key && candidate.sortable,
    );
    if (!column) return rows;
    const sortOptions = typeof column.sortable === "object" ? column.sortable : undefined;
    const direction = this.currentSort.direction === "asc" ? 1 : -1;
    const compare = (a: { row: Row; rowIndex: number }, b: { row: Row; rowIndex: number }) => {
      const valueA = unwrapCellValue(a.row[column.key]);
      const valueB = unwrapCellValue(b.row[column.key]);
      const nullOrder = compareNullsLast(valueA, valueB);
      if (nullOrder !== undefined) return nullOrder || a.rowIndex - b.rowIndex;
      const compared = sortOptions?.compare
        ? sortOptions.compare(valueA, valueB, a.row, b.row)
        : compareTableValues(valueA, valueB);
      const normalized = Number.isFinite(compared) ? compared : 0;
      return normalized === 0
        ? a.rowIndex - b.rowIndex
        : normalized * direction;
    };
    this.sortedRowCache = !rows.some(({ row }) => isStructuredTableRow(row))
      ? rows.sort(compare)
      : sortDetailRowsWithinGroups(rows, compare);
    return this.sortedRowCache;
  }

  private filteredRows(): Array<{ row: Row; rowIndex: number }> {
    if (!this.filteredRowCache)
      this.filteredRowCache = this.filteredSourceRows();
    return this.filteredRowCache;
  }

  private filteredSourceRows(): Array<{ row: Row; rowIndex: number }> {
    const rows = this.options.rows.map((row, rowIndex) => ({ row, rowIndex }));
    if (!this.currentFilters.size) return rows;
    const filters = [...this.currentFilters].flatMap(([key, filterValue]) => {
      const column = this.leafColumns().find(
        (candidate) => candidate.key === key && candidate.filterable,
      );
      if (!column) return [];
      return [{
        key,
        filterValue,
        normalizedValue: filterValue.toLocaleLowerCase(),
        options: typeof column.filterable === "object"
          ? column.filterable
          : undefined,
      }];
    });
    return rows.filter(({ row, rowIndex }) => {
      for (const filter of filters) {
        const { key, filterValue, normalizedValue, options } = filter;
        const value = unwrapCellValue(row[key]);
        const matches = options?.predicate
          ? options.predicate(value, filterValue, row, rowIndex)
          : String(value ?? "").toLocaleLowerCase().includes(
              normalizedValue,
            );
        if (!matches) return false;
      }
      return true;
    });
  }

  private toggleSort(column: FacetTableColumn<Row>): void {
    const current = this.currentSort?.key === column.key
      ? this.currentSort.direction
      : undefined;
    this.currentSort = current === "asc"
      ? { key: column.key, direction: "desc" }
      : current === "desc"
        ? undefined
        : { key: column.key, direction: "asc" };
    this.currentPage = 1;
    this.sortedRowCache = undefined;
    this.render();
    this.options.onSortChange?.(this.currentSort ? { ...this.currentSort } : undefined);
  }

  private invalidateFilteredRows(): void {
    this.filteredRowCache = undefined;
    this.sortedRowCache = undefined;
    this.sharedDomainCache = undefined;
  }

  private invalidateProcessedRows(): void {
    this.invalidateFilteredRows();
  }

  private renderPagination(): HTMLElement | undefined {
    const options = this.paginationOptions();
    const rowCount = this.filteredRows().length;
    if (!options || !rowCount) return undefined;
    const canReducePageSize =
      options.showPageSize !== false &&
      pageSizeChoices(options, this.currentPageSize).some(
        (size) => size < rowCount,
      );
    if (!options.alwaysShow && this.pageCount <= 1 && !canReducePageSize)
      return undefined;

    const labels = paginationLabels(options.labels);
    const nav = document.createElement("nav");
    nav.className = "facet-table-pagination";
    nav.setAttribute("aria-label", "Table pagination");
    nav.style.display = "flex";
    nav.style.alignItems = "center";
    nav.style.flexWrap = "wrap";
    nav.style.gap = "6px";
    nav.style.justifyContent = paginationAlignment(options.align);
    nav.style.padding = "10px 0 0";
    applyStyle(nav, this.options.style?.pagination);

    nav.appendChild(this.paginationButton(labels.first, 1, this.currentPage === 1));
    nav.appendChild(
      this.paginationButton(labels.previous, this.currentPage - 1, this.currentPage === 1),
    );

    if (options.showPageNumbers !== false) {
      for (const page of visiblePageNumbers(
        this.currentPage,
        this.pageCount,
        options.maxPageButtons ?? 5,
      )) {
        const button = this.paginationButton(String(page), page, false);
        button.classList.add("facet-table-page-button");
        if (page === this.currentPage) {
          button.classList.add("is-active");
          button.setAttribute("aria-current", "page");
          button.style.background = "var(--facet-table-page-active-background, #6366f1)";
          button.style.color = "var(--facet-table-page-active-color, #fff)";
          applyStyle(button, this.options.style?.activePageButton);
        }
        nav.appendChild(button);
      }
    }

    nav.appendChild(
      this.paginationButton(labels.next, this.currentPage + 1, this.currentPage === this.pageCount),
    );
    nav.appendChild(
      this.paginationButton(labels.last, this.pageCount, this.currentPage === this.pageCount),
    );

    const info = document.createElement("span");
    info.className = "facet-table-pagination-info";
    info.textContent = `${labels.page} ${this.currentPage} ${labels.of} ${this.pageCount} · ${this.pageRangeText()} ${labels.rows}`;
    info.style.marginInline = "4px";
    applyStyle(info, this.options.style?.paginationInfo);
    nav.appendChild(info);

    if (options.showPageSize !== false) {
      const label = document.createElement("label");
      label.className = "facet-table-page-size";
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "5px";
      label.append(document.createTextNode(`${labels.perPage} `));
      applyStyle(label, this.options.style?.pageSizeLabel);

      const select = document.createElement("select");
      select.className = "facet-table-page-size-select";
      select.setAttribute("aria-label", labels.perPage);
      for (const size of pageSizeChoices(options, this.currentPageSize)) {
        const option = document.createElement("option");
        option.value = String(size);
        option.textContent = String(size);
        option.selected = size === this.currentPageSize;
        select.appendChild(option);
      }
      select.addEventListener("change", () => this.setPageSize(Number(select.value)));
      applyStyle(select, this.options.style?.pageSizeSelect);
      label.appendChild(select);
      nav.appendChild(label);
    }
    return nav;
  }

  private paginationButton(
    label: string,
    page: number,
    disabled: boolean,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "facet-table-pagination-button";
    button.textContent = label;
    button.disabled = disabled;
    button.style.padding = "4px 8px";
    button.style.border = "1px solid var(--facet-table-border-color, #e5e7eb)";
    button.style.borderRadius = "4px";
    button.style.background = "var(--facet-table-page-background, transparent)";
    button.style.color = "inherit";
    button.style.cursor = disabled ? "default" : "pointer";
    applyStyle(button, this.options.style?.paginationButton);
    button.addEventListener("click", () => this.setPage(page));
    return button;
  }

  private pageRangeText(): string {
    const rowCount = this.filteredRows().length;
    if (!rowCount) return "0";
    const start = (this.currentPage - 1) * this.currentPageSize + 1;
    const end = Math.min(rowCount, start + this.currentPageSize - 1);
    return `${start}–${end} / ${rowCount}`;
  }

  private renderValue(
    cell: HTMLTableCellElement,
    column: FacetTableColumn<Row>,
    value: unknown,
    row: Row,
    rowIndex: number,
    descriptor?: FacetTableCellDescriptor,
  ): void {
    const formatted = value == null && !column.formatter
      ? this.options.appearance?.rowsAndColumns?.displayEmptyCellAs ?? ""
      : column.formatter
      ? column.formatter(value, row, rowIndex)
      : column.format
        ? formatString(column.format, {
            value,
            row,
            rowIndex,
            column,
          })
        : String(value);
    const prefix = descriptor?.prefix == null ? "" : String(descriptor.prefix);
    const suffix = descriptor?.suffix == null ? "" : String(descriptor.suffix);
    if (typeof formatted === "string") cell.textContent = `${prefix}${formatted}${suffix}`;
    else {
      if (prefix) cell.append(prefix);
      cell.appendChild(formatted);
      if (suffix) cell.append(suffix);
    }
  }

  private styleCell(
    cell: HTMLTableCellElement,
    column: FacetTableColumn<Row>,
    heading: boolean,
    value?: unknown,
    columnIndex = 0,
  ): void {
    cell.style.padding = densityPadding(
      this.options.layout?.rowDensity,
      !!column.chart,
      this.container.clientWidth,
    );
    this.styleBorders(cell, columnIndex);
    cell.style.textAlign = this.baseCellHorizontalAlignment(column, heading, value);
    cell.style.verticalAlign = "middle";
    const wrapText = this.options.layout?.wrapText;
    if (wrapText !== undefined) {
      cell.style.whiteSpace = wrapText ? "normal" : "nowrap";
      if (wrapText) cell.style.overflowWrap = "anywhere";
    }
    if (heading) {
      const header = this.options.appearance?.headerRow;
      cell.style.fontWeight = header?.bold === false ? "400" : header?.bold ? "700" : "600";
      cell.style.fontStyle = header?.italic ? "italic" : "normal";
      cell.style.background =
        header?.fillColor ?? "var(--facet-table-header-background, #f7f8fa)";
      if (header?.textColor) cell.style.color = header.textColor;
      if (header?.textSize !== undefined) cell.style.fontSize = cssLength(header.textSize);
      if (this.options.layout?.freezeHeaderRow) {
        cell.style.position = "sticky";
        cell.style.top = "0";
        cell.style.zIndex = "3";
      }
    }
    if (this.options.layout?.freezeFirstColumn && columnIndex === 0) {
      cell.style.position = "sticky";
      cell.style.left = "0";
      cell.style.zIndex = heading ? "4" : "2";
      if (!heading && !cell.style.backgroundColor)
        cell.style.backgroundColor =
          this.options.appearance?.rowsAndColumns?.rowFill ?? "#fff";
    }
    if (heading) applyStyle(cell, this.options.style?.headerCell);
  }

  private styleColumnGroupHeading(
    cell: HTMLTableCellElement,
    group: FacetTableColumnGroup<Row>,
    columnIndex: number,
    colSpan: number,
  ): void {
    cell.style.padding = densityPadding(
      this.options.layout?.rowDensity,
      false,
      this.container.clientWidth,
    );
    this.styleBorders(cell, columnIndex + colSpan - 1);
    cell.style.textAlign = group.horizontalAlign ?? group.align ??
      this.options.appearance?.headerRow?.alignment ?? "center";
    cell.style.verticalAlign = group.verticalAlign ?? "middle";
    const wrapText = this.options.layout?.wrapText;
    if (wrapText !== undefined) {
      cell.style.whiteSpace = wrapText ? "normal" : "nowrap";
      if (wrapText) cell.style.overflowWrap = "anywhere";
    }
    const header = this.options.appearance?.headerRow;
    cell.style.fontWeight = header?.bold === false ? "400" : header?.bold ? "700" : "600";
    cell.style.fontStyle = header?.italic ? "italic" : "normal";
    cell.style.background =
      header?.fillColor ?? "var(--facet-table-header-background, #f7f8fa)";
    if (header?.textColor) cell.style.color = header.textColor;
    if (header?.textSize !== undefined) cell.style.fontSize = cssLength(header.textSize);
    if (this.options.layout?.freezeHeaderRow) {
      cell.style.position = "sticky";
      cell.style.top = "0";
      cell.style.zIndex = "3";
    }
    if (
      this.options.layout?.freezeFirstColumn &&
      columnIndex === 0 &&
      colSpan === 1
    ) {
      cell.style.position = "sticky";
      cell.style.left = "0";
      cell.style.zIndex = "4";
    }
    applyStyle(cell, this.options.style?.headerCell);
    applyStyle(cell, this.options.style?.columnGroupHeader);
    applyStyle(cell, group.headerStyle);
  }

  private positionStickyHeaderRows(): void {
    if (!this.table) return;
    let top = 0;
    this.table.querySelectorAll<HTMLTableRowElement>("thead tr").forEach((row) => {
      row.querySelectorAll<HTMLTableCellElement>(":scope > th").forEach((cell) => {
        cell.style.top = `${top}px`;
      });
      top += row.getBoundingClientRect().height;
    });
  }

  private applyColumnStyle(
    cell: HTMLTableCellElement,
    column: FacetTableColumn<Row>,
    heading: boolean,
    value?: unknown,
    row?: Row,
    rowIndex = 0,
  ): void {
    const explicitAlignment = column.horizontalAlign ?? column.align;
    if (explicitAlignment) cell.style.textAlign = explicitAlignment;
    else if (column.role)
      cell.style.textAlign = this.cellHorizontalAlignment(column, heading, value);
    if (column.verticalAlign) cell.style.verticalAlign = column.verticalAlign;
    if (column.width !== undefined)
      cell.style.width = typeof column.width === "number"
        ? `${column.width}px`
        : column.width;
    // A resized column keeps its width: the table's spare room goes elsewhere.
    if (column.resizable && typeof column.width === "number") {
      cell.style.minWidth = `${column.width}px`;
      cell.style.maxWidth = `${column.width}px`;
    }
    applyStyle(
      cell,
      heading
        ? column.headerStyle
        : resolveColumnStyle(column.style, value, row!, rowIndex),
    );
  }

  private baseCellHorizontalAlignment(
    column: FacetTableColumn<Row>,
    heading: boolean,
    value?: unknown,
  ): "left" | "center" | "right" {
    if (heading)
      return this.options.appearance?.headerRow?.alignment ??
        (column.chart ? "center" : "left");
    const role = column.role ?? (column.chart || typeof value === "number" ? "value" : "dimension");
    const rowsAndColumns = this.options.appearance?.rowsAndColumns;
    if (!rowsAndColumns) return column.chart ? "center" : "left";
    return role === "value"
      ? rowsAndColumns.valueAlignment ?? (column.chart ? "center" : "left")
      : rowsAndColumns.dimensionAlignment ?? "left";
  }

  private cellHorizontalAlignment(
    column: FacetTableColumn<Row>,
    heading: boolean,
    value?: unknown,
  ): "left" | "center" | "right" {
    const explicit = column.horizontalAlign ?? column.align;
    if (explicit) return explicit;
    if (heading)
      return this.options.appearance?.headerRow?.alignment ??
        (column.chart ? "center" : "left");
    const role = column.role ?? (column.chart || typeof value === "number" ? "value" : "dimension");
    const rowsAndColumns = this.options.appearance?.rowsAndColumns;
    if (!rowsAndColumns) return column.chart ? "center" : "left";
    return role === "value"
      ? rowsAndColumns?.valueAlignment ?? (column.chart ? "center" : "left")
      : rowsAndColumns?.dimensionAlignment ?? "left";
  }

  private styleBorders(cell: HTMLTableCellElement, columnIndex: number): void {
    const borders = this.options.appearance?.borders;
    const color = borders?.borderColor ?? "var(--facet-table-border-color, #e5e7eb)";
    const width = cssLength(borders?.borderWidth ?? 1);
    cell.style.borderBottom = borders?.horizontalBorders === false
      ? "none"
      : `${width} solid ${color}`;
    cell.style.borderRight =
      borders?.verticalBorders && columnIndex < this.leafColumns().length - 1
        ? `${width} solid ${color}`
        : "none";
  }

  private customizedRowBackground(visibleRowIndex: number): string | undefined {
    const options = this.options.appearance?.rowsAndColumns;
    if (options?.bandedRows && visibleRowIndex % 2 === 1)
      return options.bandedRowsAlternateColor ?? "#f8fafc";
    return options?.rowFill;
  }

  private styleBodyCell(
    cell: HTMLTableCellElement,
    columnIndex: number,
    rowBackground?: string,
  ): void {
    const options = this.options.appearance?.rowsAndColumns;
    if (options?.textColor) cell.style.color = options.textColor;
    if (options?.bandedColumns && columnIndex % 2 === 1)
      cell.style.backgroundColor = options.bandedColumnsAlternateColor ?? "#f1f5f9";
    else if (this.options.layout?.freezeFirstColumn && columnIndex === 0)
      cell.style.backgroundColor = rowBackground || options?.rowFill || "#fff";
    if (
      (options?.emphasizeFirstColumn && columnIndex === 0) ||
      (options?.emphasizeLastColumn && columnIndex === this.leafColumns().length - 1)
    )
      cell.style.fontWeight = "700";
  }

  private bindRowHover(row: HTMLTableRowElement): void {
    const options = this.options.appearance?.rowsAndColumns;
    if (!options?.highlightRowOnHover) return;
    const cells = [...row.cells];
    let backgrounds: Array<{ value: string; priority: string }> = [];
    row.addEventListener("mouseenter", () => {
      backgrounds = cells.map((cell) => ({
        value: cell.style.getPropertyValue("background-color"),
        priority: cell.style.getPropertyPriority("background-color"),
      }));
      cells.forEach((cell) =>
        cell.style.setProperty(
          "background-color",
          options.hoverColor ?? "#eef2ff",
          "important",
        ),
      );
    });
    row.addEventListener("mouseleave", () => {
      cells.forEach((cell, index) => {
        const previous = backgrounds[index];
        if (previous?.value)
          cell.style.setProperty("background-color", previous.value, previous.priority);
        else
          cell.style.removeProperty("background-color");
      });
    });
  }

  private applyResponsiveDensity(): void {
    if (this.options.layout?.rowDensity !== "responsive" || !this.root)
      return;
    this.root.querySelectorAll<HTMLTableCellElement>("th, td").forEach((cell) => {
      cell.style.padding = densityPadding(
        "responsive",
        cell.classList.contains("facet-table-chart-cell") ||
          cell.classList.contains("facet-table-chart-heading"),
        this.container.clientWidth,
      );
    });
  }

  private cellSeries(
    column: FacetTableColumn<Row>,
    value: unknown,
    row: Row,
    rowIndex: number,
  ): SeriesOptions[] {
    if (column.chart?.series === "value") {
      if (!Array.isArray(value))
        throw new TypeError(
          `FacetTable: chart column "${column.key}" uses series: "value" but its cell value is not an array.`,
        );
      return value as SeriesOptions[];
    }
    if (typeof column.chart?.series === "function")
      return column.chart.series(value, row, rowIndex);
    const data = Array.isArray(value)
      ? (value as PointInput[])
      : value == null
        ? []
        : [value as PointInput];
    return [{ name: column.header ?? column.key, data }];
  }

  private sharedDomains(): Map<number, [number, number]> {
    const domains = new Map<number, [number, number]>();
    for (const [columnIndex, column] of this.leafColumns().entries()) {
      if (column.chart?.scale !== "shared") continue;
      const columnValues: number[] = [];
      this.filteredRows().forEach(({ row, rowIndex }) => {
        this.cellSeries(column, unwrapCellValue(row[column.key]), row, rowIndex).forEach((series) =>
          series.data.forEach((point) => columnValues.push(...pointValues(point))),
        );
      });
      if (!columnValues.length) continue;
      const type = column.chart.type ?? (typeof column.chart.options === "function" ? undefined : column.chart.options?.chart?.type) ?? "sparkline";
      domains.set(columnIndex, paddedDomain(columnValues, type));
    }
    return domains;
  }

  private mountChart(
    item: PendingChart<Row>,
    domain?: [number, number],
  ): FacetViz {
    const cell = item.column.chart!;
    const own =
      typeof cell.options === "function"
        ? cell.options(unwrapCellValue(item.row[item.column.key]), item.row, item.rowIndex)
        : cell.options;
    const type = cell.type ?? own?.chart?.type ?? "sparkline";
    const height = cell.height ?? own?.chart?.height ?? 44;
    let options = merge(
      {
        chart: {
          type,
          height,
          animation: false,
          backgroundColor: "transparent",
          spacing: [2, 2, 2, 2],
          responsive: false,
          scaleFonts: false,
          reflow: false,
        },
        xAxis: { visible: false },
        yAxis: { visible: false },
        legend: { enabled: false },
        series: item.series,
      } as ChartOptions,
      own as Partial<ChartOptions> | undefined,
      { series: item.series },
    );
    options.chart = { ...options.chart, type, height };

    if (domain) options = withSharedDomain(options, domain);
    if (!options.accessibility?.description) {
      const rowName = this.rowName(item.row, item.rowIndex);
      options.accessibility = {
        ...options.accessibility,
        description: `${item.column.header ?? item.column.key} for ${rowName}`,
      };
    }
    return new FacetViz(item.host, options);
  }

  private rowName(row: Row, rowIndex: number): string {
    const labelColumn = this.leafColumns().find((column) => !column.chart);
    if (!labelColumn) return `row ${rowIndex + 1}`;
    const value = unwrapCellValue(row[labelColumn.key]);
    return value == null || value === "" ? `row ${rowIndex + 1}` : String(value);
  }

  private destroyCharts(): void {
    this.charts.forEach((chart) => chart.destroy());
    this.charts.length = 0;
  }

  private paginationOptions(): FacetTablePaginationOptions | undefined {
    const pagination = this.options.pagination;
    if (!pagination) return undefined;
    if (pagination === true) return {};
    return pagination.enabled === false ? undefined : pagination;
  }

  private syncPagination(
    pagination: boolean | FacetTablePaginationOptions | undefined,
    initial: boolean,
  ): void {
    const options =
      !pagination || (typeof pagination === "object" && pagination.enabled === false)
        ? undefined
        : pagination === true
          ? {}
          : pagination;
    if (!options) {
      this.currentPage = 1;
      if (initial) this.currentPageSize = 25;
      return;
    }
    if (initial || options.pageSize !== undefined)
      this.currentPageSize = positiveInteger(
        options.pageSize ?? 25,
        "FacetTable pagination.pageSize",
      );
    if (initial || options.page !== undefined)
      this.currentPage = positiveInteger(
        options.page ?? 1,
        "FacetTable pagination.page",
      );
  }

  private clampPage(): void {
    if (!this.paginationOptions()) {
      this.currentPage = 1;
      return;
    }
    this.currentPage = Math.min(Math.max(1, this.currentPage), this.pageCount);
  }

  /** One observer per table is cheaper than one observer per chart cell. */
  private setupReflow(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => {
      this.applyResponsiveDensity();
      if (this.options.layout?.freezeHeaderRow) this.positionStickyHeaderRows();
      if (typeof requestAnimationFrame === "undefined") {
        this.reflow();
        return;
      }
      if (this.resizeFrame !== undefined) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = undefined;
        this.reflow();
      });
    });
    this.resizeObserver.observe(this.container);
  }
}

const UNITLESS_STYLE_PROPERTIES = new Set([
  "animationIterationCount",
  "flexGrow",
  "flexShrink",
  "fontWeight",
  "lineHeight",
  "opacity",
  "order",
  "zIndex",
]);

let filterIdCounter = 0;

function cssLength(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value;
}

function densityPadding(
  density: FacetTableRowDensity | undefined,
  chartCell: boolean,
  containerWidth = 0,
): string {
  if (density === "responsive") {
    if (containerWidth >= 900) return chartCell ? "4px 8px" : "10px 12px";
    if (containerWidth >= 600) return chartCell ? "2px 6px" : "6px 8px";
    return chartCell ? "1px 4px" : "4px 6px";
  }
  if (density === "compact") return chartCell ? "1px 4px" : "4px 6px";
  if (density === "cozy" || density === "crazy")
    return chartCell ? "2px 6px" : "6px 8px";
  if (density === "comfortable") return chartCell ? "4px 8px" : "10px 12px";
  return chartCell ? "2px 6px" : "8px 10px";
}

function applyStyle(
  element: HTMLElement | SVGElement,
  style: FacetTableStyle | undefined,
): void {
  if (!style) return;
  for (const [property, rawValue] of Object.entries(style)) {
    const customProperty = property.startsWith("--");
    const value =
      typeof rawValue === "number" && !customProperty && !UNITLESS_STYLE_PROPERTIES.has(property)
        ? `${rawValue}px`
        : String(rawValue);
    if (customProperty || property.includes("-"))
      element.style.setProperty(property, value);
    else
      (element.style as unknown as Record<string, string>)[property] = value;
  }
}

function resolveCellDescriptor(
  value: unknown,
): FacetTableCellDescriptor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date)
    return undefined;
  if (!Object.prototype.hasOwnProperty.call(value, "value")) return undefined;
  const candidate = value as FacetTableCellDescriptor;
  const hasDecoration = Object.keys(candidate).some(
    (property) =>
      property === "prefix" ||
      property === "suffix" ||
      property === "style" ||
      isDirectCellStyleProperty(property),
  );
  return hasDecoration ? candidate : undefined;
}

function unwrapCellValue(value: unknown): unknown {
  const descriptor = resolveCellDescriptor(value);
  return descriptor ? descriptor.value : value;
}

function descriptorStyle(
  descriptor: FacetTableCellDescriptor | undefined,
): FacetTableStyle | undefined {
  if (!descriptor) return undefined;
  const style: FacetTableStyle = { ...(descriptor.style ?? {}) };
  for (const [property, value] of Object.entries(descriptor)) {
    if (
      property === "value" ||
      property === "prefix" ||
      property === "suffix" ||
      property === "style" ||
      !isDirectCellStyleProperty(property) ||
      (typeof value !== "string" && typeof value !== "number")
    ) continue;
    style[property] = value;
  }
  return Object.keys(style).length ? style : undefined;
}

function isDirectCellStyleProperty(property: string): boolean {
  return property.startsWith("--") ||
    property.includes("-") ||
    property in document.documentElement.style;
}

const DEFAULT_SORT_PATHS = {
  asc: ["M4 10l4-4 4 4z"],
  desc: ["M4 6l4 4 4-4z"],
  none: ["M4 6l4-3 4 3z", "M4 10l4 3 4-3z"],
};

function createSortIndicator(
  direction: FacetTableSortDirection | undefined,
  custom: FacetTableSortIndicator | undefined,
): Element {
  if (typeof custom === "function") return custom(direction);
  const size = custom?.size ?? 16;
  const namespace = "http://www.w3.org/2000/svg";
  const indicator = document.createElementNS(namespace, "svg");
  indicator.setAttribute("viewBox", custom?.viewBox ?? "0 0 14 14");
  indicator.setAttribute("width", String(size));
  indicator.setAttribute("height", String(size));
  indicator.setAttribute("fill", "currentColor");
  if (!custom) {
    indicator.setAttribute("stroke", "currentColor");
    indicator.setAttribute("stroke-width", "1.8");
    indicator.setAttribute("stroke-linecap", "round");
    indicator.setAttribute("stroke-linejoin", "round");
  }
  indicator.setAttribute("focusable", "false");
  indicator.style.display = "block";
  indicator.style.width = `${size}px`;
  indicator.style.height = `${size}px`;
  indicator.style.flex = `0 0 ${size}px`;
  indicator.style.opacity = direction ? "1" : String(custom?.unsortedOpacity ?? 0.5);

  const paths = (custom?.paths ?? DEFAULT_SORT_PATHS)[direction ?? "none"];
  for (const pathData of paths) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    indicator.appendChild(path);
  }
  return indicator;
}

function createFilterIndicator(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const indicator = document.createElementNS(namespace, "svg");
  indicator.setAttribute("viewBox", "0 0 16 16");
  indicator.setAttribute("width", "16");
  indicator.setAttribute("height", "16");
  indicator.setAttribute("fill", "currentColor");
  indicator.setAttribute("aria-hidden", "true");
  indicator.setAttribute("focusable", "false");
  indicator.style.display = "block";
  indicator.style.width = "16px";
  indicator.style.height = "16px";
  indicator.style.flex = "0 0 16px";
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", "M2 3h12L9.5 8.2v3.6L6.5 13V8.2L2 3z");
  indicator.appendChild(path);
  return indicator;
}

function filterActionButton(
  label: string,
  style: FacetTableStyle | undefined,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "facet-table-filter-action";
  button.textContent = label;
  button.style.padding = "4px 8px";
  button.style.border = "1px solid var(--facet-table-border-color, #d1d5db)";
  button.style.borderRadius = "4px";
  button.style.background = "transparent";
  button.style.color = "inherit";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
  applyStyle(button, style);
  return button;
}

function resolveRowStyle<Row extends FacetTableRow>(
  style: FacetTableStyleOptions<Row>["row"],
  row: Row,
  rowIndex: number,
): FacetTableStyle | undefined {
  return typeof style === "function" ? style(row, rowIndex) : style;
}

function resolveColumnStyle<Row extends FacetTableRow>(
  style: FacetTableColumnStyle<Row> | undefined,
  value: unknown,
  row: Row,
  rowIndex: number,
): FacetTableStyle | undefined {
  return typeof style === "function" ? style(value, row, rowIndex) : style;
}

function resolveCellStyle<Row extends FacetTableRow>(
  style: FacetTableStyleOptions<Row>["cell"],
  value: unknown,
  row: Row,
  rowIndex: number,
  column: FacetTableColumn<Row>,
): FacetTableStyle | undefined {
  return typeof style === "function"
    ? style(value, row, rowIndex, column)
    : style;
}

function paginationLabels(
  labels: FacetTablePaginationLabels | undefined,
): Required<FacetTablePaginationLabels> {
  return {
    first: labels?.first ?? "First",
    previous: labels?.previous ?? "Previous",
    next: labels?.next ?? "Next",
    last: labels?.last ?? "Last",
    page: labels?.page ?? "Page",
    of: labels?.of ?? "of",
    rows: labels?.rows ?? "rows",
    perPage: labels?.perPage ?? "Rows per page",
  };
}

function paginationAlignment(
  align: FacetTablePaginationOptions["align"],
): "flex-start" | "center" | "flex-end" {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

function sortAlignment(
  align: FacetTableColumn<FacetTableRow>["align"],
): "flex-start" | "center" | "flex-end" {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

function isTableColumnGroup<Row extends FacetTableRow>(
  definition: FacetTableColumnDefinition<Row>,
): definition is FacetTableColumnGroup<Row> {
  return Array.isArray((definition as FacetTableColumnGroup<Row>).columns);
}

function flattenTableColumns<Row extends FacetTableRow>(
  definitions: FacetTableColumnDefinition<Row>[],
): FacetTableColumn<Row>[] {
  const columns: FacetTableColumn<Row>[] = [];
  definitions.forEach((definition) => {
    if (isTableColumnGroup(definition))
      columns.push(...flattenTableColumns(definition.columns));
    else columns.push(definition);
  });
  return columns;
}

function tableColumnDepth<Row extends FacetTableRow>(
  definitions: FacetTableColumnDefinition<Row>[],
): number {
  return definitions.reduce(
    (maximum, definition) => Math.max(
      maximum,
      isTableColumnGroup(definition)
        ? 1 + tableColumnDepth(definition.columns)
        : 1,
    ),
    1,
  );
}

function tableColumnLeafCount<Row extends FacetTableRow>(
  definition: FacetTableColumnDefinition<Row>,
): number {
  return isTableColumnGroup(definition)
    ? definition.columns.reduce(
        (total, child) => total + tableColumnLeafCount(child),
        0,
      )
    : 1;
}

function validateTableColumns<Row extends FacetTableRow>(
  definitions: FacetTableColumnDefinition<Row>[],
): void {
  if (!definitions.length)
    throw new Error("FacetTable: at least one column is required");
  const visit = (items: FacetTableColumnDefinition<Row>[]): void => {
    items.forEach((definition) => {
      if (!isTableColumnGroup(definition)) return;
      if (!definition.columns.length)
        throw new Error(
          `FacetTable: column group "${definition.header}" must contain at least one column.`,
        );
      visit(definition.columns);
    });
  };
  visit(definitions);
}

function initialSort<Row extends FacetTableRow>(
  columns: FacetTableColumn<Row>[],
): FacetTableSortState<Row> | undefined {
  const column = columns.find(
    (candidate) =>
      typeof candidate.sortable === "object" &&
      candidate.sortable.initialDirection,
  );
  if (!column || typeof column.sortable !== "object" || !column.sortable.initialDirection)
    return undefined;
  return { key: column.key, direction: column.sortable.initialDirection };
}

function initialFilters<Row extends FacetTableRow>(
  columns: FacetTableColumn<Row>[],
): Map<keyof Row & string, string> {
  const filters = new Map<keyof Row & string, string>();
  for (const column of columns) {
    if (typeof column.filterable !== "object") continue;
    const value = column.filterable.initialValue?.trim();
    if (value) filters.set(column.key, value);
  }
  return filters;
}

function reconcileFilters<Row extends FacetTableRow>(
  current: Map<keyof Row & string, string>,
  columns: FacetTableColumn<Row>[],
): Map<keyof Row & string, string> {
  const filters = initialFilters(columns);
  for (const [key, value] of current) {
    if (columns.some((column) => column.key === key && column.filterable))
      filters.set(key, value);
  }
  return filters;
}

function tableRowType<Row extends FacetTableRow>(
  row: Row,
): FacetTableRowMetadata["rowType"] {
  const value = (row as FacetTableRowMetadata).rowType;
  return value === "detail" || value === "subtotal" || value === "grandTotal"
    ? value
    : undefined;
}

function tableRowGroupPath<Row extends FacetTableRow>(
  row: Row,
): ReadonlyArray<unknown> {
  const value = (row as FacetTableRowMetadata).groupPath;
  return Array.isArray(value) ? value : [];
}

function isStructuredTableRow<Row extends FacetTableRow>(row: Row): boolean {
  return tableRowType(row) !== undefined || tableRowGroupPath(row).length > 0;
}

function sortDetailRowsWithinGroups<Row extends FacetTableRow>(
  rows: Array<{ row: Row; rowIndex: number }>,
  compare: (
    a: { row: Row; rowIndex: number },
    b: { row: Row; rowIndex: number },
  ) => number,
): Array<{ row: Row; rowIndex: number }> {
  const result = [...rows];
  const groups = new Map<string, {
    positions: number[];
    rows: Array<{ row: Row; rowIndex: number }>;
  }>();

  rows.forEach((entry, position) => {
    const rowType = tableRowType(entry.row);
    if (rowType === "subtotal" || rowType === "grandTotal") return;
    const signature = groupPathSignature(tableRowGroupPath(entry.row));
    const group = groups.get(signature) ?? { positions: [], rows: [] };
    group.positions.push(position);
    group.rows.push(entry);
    groups.set(signature, group);
  });

  groups.forEach((group) => {
    group.rows.sort(compare);
    group.positions.forEach((position, index) => {
      result[position] = group.rows[index];
    });
  });
  return result;
}

function groupPathSignature(groupPath: ReadonlyArray<unknown>): string {
  return groupPath.map(groupPathValueSignature).join("\u001f");
}

function groupPathValueSignature(value: unknown): string {
  if (value instanceof Date) return "date:" + value.toISOString();
  if (value && typeof value === "object") {
    try {
      return "object:" + JSON.stringify(value);
    } catch {
      return "object:" + String(value);
    }
  }
  return typeof value + ":" + String(value);
}
function compareNullsLast(a: unknown, b: unknown): number | undefined {
  const aNull = a == null;
  const bNull = b == null;
  if (!aNull && !bNull) return undefined;
  if (aNull && bNull) return 0;
  return aNull ? 1 : -1;
}

function compareTableValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function pageSizeChoices(
  options: FacetTablePaginationOptions,
  current: number,
): number[] {
  const choices = options.pageSizeOptions ?? [10, 25, 50, 100];
  const valid = choices.filter(
    (value) => Number.isSafeInteger(value) && value > 0,
  );
  return [...new Set([...valid, current])].sort((a, b) => a - b);
}

function visiblePageNumbers(
  current: number,
  count: number,
  requestedMaximum: number,
): number[] {
  const maximum = Math.max(1, Math.floor(requestedMaximum) || 1);
  const visible = Math.min(count, maximum);
  const start = Math.min(
    Math.max(1, current - Math.floor(visible / 2)),
    Math.max(1, count - visible + 1),
  );
  return Array.from({ length: visible }, (_, index) => start + index);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive integer.`);
  return value;
}

function clampInteger(
  value: number,
  min: number,
  max: number,
  label: string,
): number {
  const integer = positiveInteger(value, label);
  return Math.min(max, Math.max(min, integer));
}

function pointValues(point: PointInput): number[] {
  if (typeof point === "number") return Number.isFinite(point) ? [point] : [];
  if (Array.isArray(point)) {
    const values = point.slice(1).filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value),
    );
    return values;
  }
  if (!point || typeof point !== "object") return [];
  return [point.y, point.low, point.high, point.value].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function paddedDomain(values: number[], type: ChartType): [number, number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  const zeroBased = type === "bar" || type === "column" || type === "lollipop";
  if (zeroBased) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const padding = Math.abs(min) * 0.05 || 1;
    return zeroBased && min >= 0
      ? [0, max + padding]
      : [min - padding, max + padding];
  }
  const padding = (max - min) * 0.05;
  return [zeroBased && min === 0 ? 0 : min - padding, zeroBased && max === 0 ? 0 : max + padding];
}

function withSharedDomain(
  options: ChartOptions,
  [min, max]: [number, number],
): ChartOptions {
  if (Array.isArray(options.yAxis)) {
    const axes = options.yAxis.length ? [...options.yAxis] : [{}];
    axes[0] = { ...axes[0], min: axes[0].min ?? min, max: axes[0].max ?? max };
    return { ...options, yAxis: axes };
  }
  return {
    ...options,
    yAxis: {
      ...options.yAxis,
      min: options.yAxis?.min ?? min,
      max: options.yAxis?.max ?? max,
    },
  };
}
