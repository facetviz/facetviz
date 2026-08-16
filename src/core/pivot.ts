import type {
  FacetTableCellChartOptions,
  FacetTableColumnDefinition,
  FacetTableColumnFilterOptions,
  FacetTableColumnSortOptions,
  FacetTableColumnStyle,
  FacetTableRow,
  FacetTableRowMetadata,
  FacetTableStyle,
} from "./table.js";

export type PivotAggregateOperation = "sum" | "average" | "avg" | "count" | "min" | "max";

export type PivotAggregate<Row extends FacetTableRow> =
  | PivotAggregateOperation
  | ((values: unknown[], rows: Row[]) => unknown);

export type PivotFieldOrder =
  | "asc"
  | "desc"
  | ReadonlyArray<unknown>
  | ((a: unknown, b: unknown) => number);

export interface PivotField<Row extends FacetTableRow> {
  key: keyof Row & string;
  header?: string;
  /** Source order is retained when omitted. */
  order?: PivotFieldOrder;
  /** Format a row value or generated column-group heading. */
  formatter?: (value: unknown) => string;
}

export type PivotFieldInput<Row extends FacetTableRow> =
  | (keyof Row & string)
  | PivotField<Row>;

export type PivotTableRow = Record<string, unknown> & FacetTableRowMetadata;

export interface PivotMeasure<Row extends FacetTableRow> {
  key: keyof Row & string;
  header?: string;
  /** Default `sum`. */
  aggregate?: PivotAggregate<Row>;
  format?: string;
  width?: number | string;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  sortable?: boolean | FacetTableColumnSortOptions<PivotTableRow>;
  filterable?: boolean | FacetTableColumnFilterOptions<PivotTableRow>;
  style?: FacetTableColumnStyle<PivotTableRow>;
  headerStyle?: FacetTableStyle;
  chart?: FacetTableCellChartOptions<PivotTableRow>;
}

export interface PivotGrandTotalsOptions {
  /** Add a grand-total row. Default `true` when an object is supplied. */
  rows?: boolean;
  /** Add a grand-total column group. Default `true` when an object is supplied. */
  columns?: boolean;
}

export interface PivotDataOptions<Row extends FacetTableRow> {
  rows: ReadonlyArray<PivotFieldInput<Row>>;
  columns: ReadonlyArray<PivotFieldInput<Row>>;
  measures: ReadonlyArray<PivotMeasure<Row>>;
  /** Add hierarchical row subtotals after child rows. Default `false`. */
  subtotals?: boolean;
  /** Add total rows/columns. Boolean enables or disables both. Default `false`. */
  grandTotals?: boolean | PivotGrandTotalsOptions;
  /** Value used when no records exist for a pivot cell. Default `null`. */
  emptyValue?: unknown;
  /** Template or callback for subtotal row labels. Default `{value} — subtotal`. */
  subtotalLabel?: string | ((value: unknown, key: keyof Row & string, path: unknown[]) => string);
  /** Label used by the grand-total row and column group. Default `Grand total`. */
  grandTotalLabel?: string;
}

export interface PivotDataResult {
  rows: PivotTableRow[];
  columns: FacetTableColumnDefinition<PivotTableRow>[];
}

interface NormalizedPivotField<Row extends FacetTableRow> extends PivotField<Row> {
  key: keyof Row & string;
}

interface PivotTreeNode<Row extends FacetTableRow> {
  value?: unknown;
  path: unknown[];
  sourceRows: Row[];
  children: Map<string, PivotTreeNode<Row>>;
}

interface PivotColumnLeaf<Row extends FacetTableRow> {
  path: unknown[];
  signature: string;
  keys: string[];
  nodes: PivotTreeNode<Row>[];
}

/** Transform raw records into FacetTable-ready pivot rows and nested columns. */
export function pivotData<Row extends FacetTableRow>(
  data: ReadonlyArray<Row>,
  options: PivotDataOptions<Row>,
): PivotDataResult {
  const rowFields = normalizePivotFields(options.rows);
  const columnFields = normalizePivotFields(options.columns);
  validatePivotOptions(rowFields, columnFields, options.measures);
  const sourceRows = [...data];
  const emptyValue = Object.prototype.hasOwnProperty.call(options, "emptyValue")
    ? options.emptyValue
    : null;
  const totals = normalizeGrandTotals(options.grandTotals);
  const reservedKeys = new Set<string>([
    ...rowFields.map((field) => field.key),
    "rowType",
    "groupPath",
  ]);
  const generatedKeys = new Set(reservedKeys);

  const columnRoot = buildPivotTree(sourceRows, columnFields);
  const columnLeaves = collectColumnLeaves(columnRoot, columnFields);
  columnLeaves.forEach((leaf, leafIndex) => {
    leaf.keys = options.measures.map((_measure, measureIndex) =>
      uniquePivotKey(`__pivot_${leafIndex}_${measureIndex}`, generatedKeys)
    );
  });
  const totalKeys = totals.columns
    ? options.measures.map((_measure, measureIndex) =>
        uniquePivotKey(`__pivot_total_${measureIndex}`, generatedKeys)
      )
    : [];

  const columns: FacetTableColumnDefinition<PivotTableRow>[] = [
    ...rowFields.map((field) => ({
      key: field.key,
      header: field.header ?? field.key,
      role: "dimension" as const,
    })),
    ...buildPivotColumnDefinitions(
      columnRoot,
      columnFields,
      columnLeaves,
      options.measures,
    ),
  ];
  if (totals.columns) {
    columns.push({
      header: options.grandTotalLabel ?? "Grand total",
      columns: options.measures.map((measure, index) =>
        pivotMeasureColumn(totalKeys[index], measure)
      ),
    });
  }

  const rowRoot = buildPivotTree(sourceRows, rowFields);
  const rows: PivotTableRow[] = [];
  const renderRow = (
    node: PivotTreeNode<Row>,
    path: unknown[],
    rowType: "detail" | "subtotal" | "grandTotal",
  ): void => {
    const result: PivotTableRow = { rowType, groupPath: [] };
    rowFields.forEach((field, index) => {
      const value = index < path.length ? path[index] : "";
      (result as Record<string, unknown>)[field.key] =
        index < path.length && field.formatter ? field.formatter(value) : value;
    });
    if (rowType === "detail") {
      result.groupPath = path.slice(0, -1);
    } else if (rowType === "subtotal") {
      result.groupPath = [...path];
      const index = path.length - 1;
      const field = rowFields[index];
      if (field) {
        const value = path[index];
        (result as Record<string, unknown>)[field.key] = formatSubtotalLabel(
          options.subtotalLabel,
          value,
          field.key,
          path,
        );
      }
    } else {
      result.groupPath = [];
      (result as Record<string, unknown>)[rowFields[0].key] =
        options.grandTotalLabel ?? "Grand total";
    }
    assignPivotValues(
      result,
      node.sourceRows,
      columnFields,
      columnLeaves,
      options.measures,
      emptyValue,
    );
    if (totals.columns) {
      options.measures.forEach((measure, index) => {
        result[totalKeys[index]] = aggregatePivotMeasure(
          measure,
          node.sourceRows,
          emptyValue,
        );
      });
    }
    rows.push(result);
  };

  const visitRows = (
    node: PivotTreeNode<Row>,
    depth: number,
    path: unknown[],
  ): void => {
    if (depth === rowFields.length) {
      renderRow(node, path, "detail");
      return;
    }
    orderedPivotChildren(node, rowFields[depth]).forEach((child) =>
      visitRows(child, depth + 1, [...path, child.value])
    );
    if (options.subtotals && depth > 0 && depth < rowFields.length)
      renderRow(node, path, "subtotal");
  };

  visitRows(rowRoot, 0, []);
  if (totals.rows) renderRow(rowRoot, [], "grandTotal");
  return { rows, columns };
}

function normalizePivotFields<Row extends FacetTableRow>(
  inputs: ReadonlyArray<PivotFieldInput<Row>>,
): NormalizedPivotField<Row>[] {
  return inputs.map((input) =>
    typeof input === "string" ? { key: input } : { ...input }
  );
}

function validatePivotOptions<Row extends FacetTableRow>(
  rows: NormalizedPivotField<Row>[],
  columns: NormalizedPivotField<Row>[],
  measures: ReadonlyArray<PivotMeasure<Row>>,
): void {
  if (!rows.length) throw new Error("pivotData(): at least one row field is required.");
  if (!columns.length) throw new Error("pivotData(): at least one column field is required.");
  if (!measures.length) throw new Error("pivotData(): at least one measure is required.");
  const rowKeys = new Set<string>(rows.map((field) => field.key));
  if (rowKeys.size !== rows.length)
    throw new Error("pivotData(): row fields cannot contain duplicate keys.");
  const columnKeys = new Set<string>(columns.map((field) => field.key));
  if (columnKeys.size !== columns.length)
    throw new Error("pivotData(): column fields cannot contain duplicate keys.");
  if ([...rowKeys].some((key) => columnKeys.has(key)))
    throw new Error("pivotData(): a field cannot be used in both rows and columns.");
  if (rowKeys.has("rowType") || rowKeys.has("groupPath"))
    throw new Error('pivotData(): "rowType" and "groupPath" are reserved row fields.');
  const operations: PivotAggregateOperation[] = [
    "sum", "average", "avg", "count", "min", "max",
  ];
  measures.forEach((measure) => {
    if (
      typeof measure.aggregate === "string" &&
      !operations.includes(measure.aggregate as PivotAggregateOperation)
    )
      throw new Error(
        `pivotData(): unsupported aggregate "${measure.aggregate}".`,
      );
  });
}

function normalizeGrandTotals(
  option: PivotDataOptions<FacetTableRow>["grandTotals"],
): Required<PivotGrandTotalsOptions> {
  if (typeof option === "boolean") return { rows: option, columns: option };
  if (!option) return { rows: false, columns: false };
  return { rows: option.rows !== false, columns: option.columns !== false };
}

function buildPivotTree<Row extends FacetTableRow>(
  rows: Row[],
  fields: NormalizedPivotField<Row>[],
): PivotTreeNode<Row> {
  const root: PivotTreeNode<Row> = {
    path: [],
    sourceRows: [...rows],
    children: new Map(),
  };
  rows.forEach((row) => {
    let node = root;
    fields.forEach((field) => {
      const value = row[field.key];
      const signature = pivotValueSignature(value);
      let child = node.children.get(signature);
      if (!child) {
        child = {
          value,
          path: [...node.path, value],
          sourceRows: [],
          children: new Map(),
        };
        node.children.set(signature, child);
      }
      child.sourceRows.push(row);
      node = child;
    });
  });
  return root;
}

function collectColumnLeaves<Row extends FacetTableRow>(
  root: PivotTreeNode<Row>,
  fields: NormalizedPivotField<Row>[],
): PivotColumnLeaf<Row>[] {
  const leaves: PivotColumnLeaf<Row>[] = [];
  const visit = (node: PivotTreeNode<Row>, depth: number, nodes: PivotTreeNode<Row>[]): void => {
    if (depth === fields.length) {
      leaves.push({
        path: [...node.path],
        signature: pivotPathSignature(node.path),
        keys: [],
        nodes,
      });
      return;
    }
    orderedPivotChildren(node, fields[depth]).forEach((child) =>
      visit(child, depth + 1, [...nodes, child])
    );
  };
  visit(root, 0, []);
  return leaves;
}

function buildPivotColumnDefinitions<Row extends FacetTableRow>(
  root: PivotTreeNode<Row>,
  fields: NormalizedPivotField<Row>[],
  leaves: PivotColumnLeaf<Row>[],
  measures: ReadonlyArray<PivotMeasure<Row>>,
): FacetTableColumnDefinition<PivotTableRow>[] {
  const leafBySignature = new Map(leaves.map((leaf) => [leaf.signature, leaf]));
  const visit = (
    node: PivotTreeNode<Row>,
    depth: number,
  ): FacetTableColumnDefinition<PivotTableRow>[] =>
    orderedPivotChildren(node, fields[depth]).map((child) => {
      const field = fields[depth];
      const header = field.formatter
        ? field.formatter(child.value)
        : String(child.value ?? "(blank)");
      if (depth === fields.length - 1) {
        const leaf = leafBySignature.get(pivotPathSignature(child.path))!;
        return {
          header,
          columns: measures.map((measure, index) =>
            pivotMeasureColumn(leaf.keys[index], measure)
          ),
        };
      }
      return { header, columns: visit(child, depth + 1) };
    });
  return visit(root, 0);
}

function pivotMeasureColumn<Row extends FacetTableRow>(
  key: string,
  measure: PivotMeasure<Row>,
): FacetTableColumnDefinition<PivotTableRow> {
  return {
    key,
    header: measure.header ?? measure.key,
    role: "value",
    format: measure.format,
    width: measure.width,
    horizontalAlign: measure.horizontalAlign,
    verticalAlign: measure.verticalAlign,
    sortable: measure.sortable,
    filterable: measure.filterable,
    style: measure.style,
    headerStyle: measure.headerStyle,
    chart: measure.chart,
  };
}

function assignPivotValues<Row extends FacetTableRow>(
  result: PivotTableRow,
  sourceRows: Row[],
  columnFields: NormalizedPivotField<Row>[],
  leaves: PivotColumnLeaf<Row>[],
  measures: ReadonlyArray<PivotMeasure<Row>>,
  emptyValue: unknown,
): void {
  const buckets = new Map<string, Row[]>();
  sourceRows.forEach((row) => {
    const signature = pivotPathSignature(columnFields.map((field) => row[field.key]));
    const bucket = buckets.get(signature);
    if (bucket) bucket.push(row);
    else buckets.set(signature, [row]);
  });
  leaves.forEach((leaf) => {
    const bucket = buckets.get(leaf.signature) ?? [];
    measures.forEach((measure, index) => {
      result[leaf.keys[index]] = aggregatePivotMeasure(measure, bucket, emptyValue);
    });
  });
}

function aggregatePivotMeasure<Row extends FacetTableRow>(
  measure: PivotMeasure<Row>,
  rows: Row[],
  emptyValue: unknown,
): unknown {
  if (!rows.length) return emptyValue;
  const values = rows.map((row) => row[measure.key]);
  const aggregate = measure.aggregate ?? "sum";
  if (typeof aggregate === "function") return aggregate(values, rows);
  const present = values.filter((value) => value != null);
  if (aggregate === "count") return present.length;
  if (aggregate === "min" || aggregate === "max") {
    if (!present.length) return emptyValue;
    return present.slice(1).reduce((selected, value) => {
      const compared = comparePivotValues(value, selected);
      return aggregate === "min"
        ? compared < 0 ? value : selected
        : compared > 0 ? value : selected;
    }, present[0]);
  }
  const numbers = present.map(Number).filter(Number.isFinite);
  if (!numbers.length) return emptyValue;
  const sum = numbers.reduce((total, value) => total + value, 0);
  return aggregate === "average" || aggregate === "avg"
    ? sum / numbers.length
    : sum;
}

function orderedPivotChildren<Row extends FacetTableRow>(
  node: PivotTreeNode<Row>,
  field: NormalizedPivotField<Row>,
): PivotTreeNode<Row>[] {
  const children = [...node.children.values()];
  const order = field.order;
  if (!order) return children;
  const sourceIndex = new Map(children.map((child, index) => [child, index]));
  const explicit = Array.isArray(order)
    ? new Map(order.map((value, index) => [pivotValueSignature(value), index]))
    : undefined;
  return children.sort((a, b) => {
    let compared = 0;
    if (explicit) {
      const indexA = explicit.get(pivotValueSignature(a.value)) ?? Number.MAX_SAFE_INTEGER;
      const indexB = explicit.get(pivotValueSignature(b.value)) ?? Number.MAX_SAFE_INTEGER;
      compared = indexA - indexB;
    } else if (typeof order === "function") {
      compared = order(a.value, b.value);
    } else {
      compared = comparePivotValues(a.value, b.value) * (order === "desc" ? -1 : 1);
    }
    return Number.isFinite(compared) && compared !== 0
      ? compared
      : sourceIndex.get(a)! - sourceIndex.get(b)!;
  });
}

function formatSubtotalLabel<Row extends FacetTableRow>(
  label: PivotDataOptions<Row>["subtotalLabel"],
  value: unknown,
  key: keyof Row & string,
  path: unknown[],
): string {
  if (typeof label === "function") return label(value, key, [...path]);
  return (label ?? "{value} — subtotal")
    .split("{value}")
    .join(String(value ?? ""));
}

function uniquePivotKey(base: string, used: Set<string>): string {
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}_${suffix++}`;
  used.add(key);
  return key;
}

function pivotPathSignature(path: ReadonlyArray<unknown>): string {
  return JSON.stringify(path.map(pivotValueSignature));
}

function pivotValueSignature(value: unknown): string {
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (value && typeof value === "object") {
    try {
      return `object:${JSON.stringify(value)}`;
    } catch {
      return `object:${String(value)}`;
    }
  }
  return `${typeof value}:${String(value)}`;
}

function comparePivotValues(a: unknown, b: unknown): number {
  if (a == null || b == null) {
    if (a == null && b == null) return 0;
    return a == null ? 1 : -1;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
