/**
 * Canvas grid builder: turns the Rows and Columns shelves into the table a
 * chart is drawn on — header levels with their cells, pane rows and pane
 * columns (leaves), and one pane per row leaf × column leaf. It only works
 * out the structure; measuring and drawing come later.
 *
 *   columns: [dim Region, category Category]     rows: [dim Segment, axis [Sales, Profit]]
 *
 *                 │      East       │      West       │   ← header level (Region)
 *   Consumer Sales│ pane            │ pane            │   ← row leaf: Consumer × Sales
 *            Profit│ pane            │ pane            │   ← row leaf: Consumer × Profit
 *   Corporate …    │                 │                 │
 *
 * A `dim` item becomes a header level. `nest` (the default) keeps only the
 * combinations that occur in the data under the levels before it; `cross`
 * takes every value of the field under each of them. A `category` item is
 * the innermost discrete field drawn as a category axis inside each pane
 * rather than as headers. An `axis` item gives each of its measures its own
 * leaf (pane row on Rows, pane column on Columns), innermost.
 */

/** How a header level or category orders its values. */
export type CanvasSort = "data" | "asc" | "desc" | ReadonlyArray<string>;

export type CanvasShelfItem =
  | { kind: "dim"; field: string; nest?: "nest" | "cross"; sort?: CanvasSort }
  | { kind: "category"; field: string; nest?: "nest" | "cross"; sort?: CanvasSort }
  | { kind: "axis"; measures: string[] };

/** A field's value in a record: anything else is read as `String(value)`; missing is `null`. */
export type CanvasValue = string | null;

export interface CanvasGridInput {
  rows?: CanvasShelfItem[];
  columns?: CanvasShelfItem[];
  /** One record per data point, carrying its value of each shelf field. */
  records: ReadonlyArray<Record<string, unknown>>;
}

/** A pane row (on Rows) or pane column (on Columns). */
export interface CanvasLeaf {
  index: number;
  /** Stable address, e.g. `Segment=Consumer|@measure=Sales`. */
  key: string;
  /** Header values, outer level first, parallel to the track's `fields`. */
  values: CanvasValue[];
  /** The measure this leaf draws, when the shelf has an axis. */
  measure?: string;
  /** Category values along this leaf's category axis, when the shelf has one. */
  categories?: CanvasValue[];
}

/** One header value spanning consecutive leaves. */
export interface CanvasHeaderCell {
  value: CanvasValue;
  /** First leaf this cell covers. */
  start: number;
  /** Number of leaves it covers. */
  span: number;
  /** Values of this and every outer level, outer first. */
  path: CanvasValue[];
}

export interface CanvasHeaderLevel {
  field: string;
  /** 0 = outermost. */
  level: number;
  cells: CanvasHeaderCell[];
}

/** The structure along one direction (Rows or Columns). */
export interface CanvasTrack {
  /** Header fields, outer first. */
  fields: string[];
  headers: CanvasHeaderLevel[];
  leaves: CanvasLeaf[];
  /** Field drawn as a category axis inside each pane, if any. */
  category?: string;
  /** Measures given their own leaves, if the shelf has an axis. */
  measures?: string[];
}

export interface CanvasPane {
  /** Stable address: the row leaf's key and the column leaf's, e.g. `Segment=Consumer#Region=East`. */
  key: string;
  row: number;
  column: number;
  rowMeasure?: string;
  columnMeasure?: string;
  /** No record falls in this pane (crossed rows and columns can meet where there's no data). */
  empty: boolean;
}

export interface CanvasGrid {
  rows: CanvasTrack;
  columns: CanvasTrack;
  /** Row-major: pane `r * columns.leaves.length + c`. */
  panes: CanvasPane[];
}

/** The key of a field's value in a record. Kept apart from every real string. */
const NULL_KEY = "\u0000";

function valueOf(record: Record<string, unknown>, field: string): CanvasValue {
  const v = record[field];
  return v === undefined || v === null ? null : String(v);
}

const keyOf = (v: CanvasValue) => (v === null ? NULL_KEY : v);

/** `|`, `=`, `#` and `\` escaped so keys built from any values never collide. */
function escapeKeyPart(s: string): string {
  return s.replace(/[\\|=#]/g, (c) => `\\${c}`);
}

function leafKey(fields: string[], values: CanvasValue[], measure?: string): string {
  const parts = fields.map(
    (f, i) => `${escapeKeyPart(f)}=${values[i] === null ? "\\0" : escapeKeyPart(values[i] as string)}`,
  );
  if (measure !== undefined) parts.push(`@measure=${escapeKeyPart(measure)}`);
  return parts.join("|");
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** `values` (in first-seen order) ordered by `sort`. Nulls go last except in a listed order. */
export function sortValues(values: CanvasValue[], sort: CanvasSort = "data"): CanvasValue[] {
  if (sort === "data") return values;
  if (sort === "asc" || sort === "desc") {
    const sign = sort === "asc" ? 1 : -1;
    return [...values].sort((a, b) => {
      if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
      return sign * collator.compare(a, b);
    });
  }
  // A listed order: those values first, in that order; the rest after, as found.
  const rank = new Map(sort.map((v, i) => [v, i]));
  const listed = values.filter((v) => v !== null && rank.has(v));
  listed.sort((a, b) => rank.get(a as string)! - rank.get(b as string)!);
  return [...listed, ...values.filter((v) => v === null || !rank.has(v))];
}

/** Checks one shelf's items; throws on a shelf that can't be laid out. */
function checkShelf(items: CanvasShelfItem[], name: string): void {
  const inner = items.findIndex((it) => it.kind !== "dim");
  if (inner >= 0 && inner !== items.length - 1)
    throw new Error(`${name}: a category or axis must be the last item on the shelf`);
  const last = items[items.length - 1];
  if (last?.kind === "axis" && last.measures.length === 0)
    throw new Error(`${name}: an axis needs at least one measure`);
}

interface Tuple {
  values: CanvasValue[];
  /** Indices of the records under this tuple. */
  records: number[];
}

/** The leaves along one shelf, with their header levels. */
function buildTrack(
  items: CanvasShelfItem[],
  records: ReadonlyArray<Record<string, unknown>>,
): CanvasTrack {
  const dims = items.filter((it): it is Extract<CanvasShelfItem, { kind: "dim" }> => it.kind === "dim");
  const last = items[items.length - 1];
  const category = last?.kind === "category" ? last : undefined;
  const axis = last?.kind === "axis" ? last : undefined;
  const fields = dims.map((d) => d.field);

  let tuples: Tuple[] = [{ values: [], records: records.map((_, i) => i) }];
  for (const dim of dims) {
    const crossed =
      dim.nest === "cross"
        ? sortValues(distinct(records.map((_, i) => i), records, dim.field), dim.sort)
        : undefined;
    const next: Tuple[] = [];
    for (const t of tuples) {
      const byValue = groupBy(t.records, records, dim.field);
      const values = crossed ?? sortValues([...byValue.keys()].map(fromKey), dim.sort);
      for (const v of values)
        next.push({ values: [...t.values, v], records: byValue.get(keyOf(v)) ?? [] });
    }
    tuples = next;
  }

  const allCategories = category && category.nest === "cross"
    ? sortValues(distinct(records.map((_, i) => i), records, category.field), category.sort)
    : undefined;
  const measures = axis?.measures ?? [undefined];
  const leaves: CanvasLeaf[] = [];
  for (const t of tuples) {
    const categories = category
      ? allCategories ?? sortValues(distinct(t.records, records, category.field), category.sort)
      : undefined;
    for (const measure of measures) {
      leaves.push({
        index: leaves.length,
        key: leafKey(fields, t.values, measure),
        values: t.values,
        ...(measure !== undefined ? { measure } : {}),
        ...(categories ? { categories } : {}),
      });
    }
  }

  const headers: CanvasHeaderLevel[] = fields.map((field, level) => {
    const cells: CanvasHeaderCell[] = [];
    let prefix = "";
    for (const leaf of leaves) {
      const path = leaf.values.slice(0, level + 1);
      const k = path.map(keyOf).join(NULL_KEY + NULL_KEY);
      const open = cells[cells.length - 1];
      if (open && k === prefix) open.span++;
      else {
        cells.push({ value: leaf.values[level], start: leaf.index, span: 1, path });
        prefix = k;
      }
    }
    return { field, level, cells };
  });

  return {
    fields,
    headers,
    leaves,
    ...(category ? { category: category.field } : {}),
    ...(axis ? { measures: [...axis.measures] } : {}),
  };
}

function fromKey(k: string): CanvasValue {
  return k === NULL_KEY ? null : k;
}

/** Record indices grouped by their value of `field`, groups in first-seen order. */
function groupBy(
  indices: number[],
  records: ReadonlyArray<Record<string, unknown>>,
  field: string,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const i of indices) {
    const k = keyOf(valueOf(records[i], field));
    const list = out.get(k);
    if (list) list.push(i);
    else out.set(k, [i]);
  }
  return out;
}

function distinct(
  indices: number[],
  records: ReadonlyArray<Record<string, unknown>>,
  field: string,
): CanvasValue[] {
  return [...groupBy(indices, records, field).keys()].map(fromKey);
}

/** Whether a record carries every value of a leaf. */
function matches(record: Record<string, unknown>, track: CanvasTrack, leaf: CanvasLeaf): boolean {
  return track.fields.every((f, i) => valueOf(record, f) === leaf.values[i]);
}

/**
 * The grid for `input`: header levels, leaves and panes along Rows and
 * Columns. With nothing on a shelf it has one leaf with no values, so a
 * plain chart is one pane.
 */
export function buildCanvasGrid(input: CanvasGridInput): CanvasGrid {
  const rowItems = input.rows ?? [];
  const columnItems = input.columns ?? [];
  checkShelf(rowItems, "Rows");
  checkShelf(columnItems, "Columns");
  const seen = new Set<string>();
  for (const it of [...rowItems, ...columnItems]) {
    if (it.kind === "axis") continue;
    if (seen.has(it.field)) throw new Error(`${it.field} is on the shelves twice`);
    seen.add(it.field);
  }

  const rows = buildTrack(rowItems, input.records);
  const columns = buildTrack(columnItems, input.records);

  // Which (row leaf, column leaf) pairs hold a record. Leaves sharing values
  // (one per measure) share the answer.
  const filled = new Set<string>();
  const rowOf = leafIndex(rows);
  const columnOf = leafIndex(columns);
  for (const record of input.records) {
    const r = rowOf(record);
    const c = columnOf(record);
    if (r !== undefined && c !== undefined) filled.add(`${r}\u0001${c}`);
  }

  const panes: CanvasPane[] = [];
  for (const rl of rows.leaves) {
    for (const cl of columns.leaves) {
      const rv = rl.values.map(keyOf).join(NULL_KEY + NULL_KEY);
      const cv = cl.values.map(keyOf).join(NULL_KEY + NULL_KEY);
      panes.push({
        key: `${rl.key}#${cl.key}`,
        row: rl.index,
        column: cl.index,
        ...(rl.measure !== undefined ? { rowMeasure: rl.measure } : {}),
        ...(cl.measure !== undefined ? { columnMeasure: cl.measure } : {}),
        empty: !filled.has(`${rv}\u0001${cv}`),
      });
    }
  }
  return { rows, columns, panes };
}

/** A record's header values along `track`, as one key; undefined when no leaf has them. */
function leafIndex(track: CanvasTrack): (record: Record<string, unknown>) => string | undefined {
  const known = new Set(track.leaves.map((l) => l.values.map(keyOf).join(NULL_KEY + NULL_KEY)));
  return (record) => {
    const k = track.fields.map((f) => keyOf(valueOf(record, f))).join(NULL_KEY + NULL_KEY);
    return known.has(k) ? k : undefined;
  };
}

/** The pane at row leaf `row` and column leaf `column`. */
export function paneAt(grid: CanvasGrid, row: number, column: number): CanvasPane | undefined {
  return grid.panes[row * grid.columns.leaves.length + column];
}

/** Whether `record` falls in `pane` (its row and column header values match). */
export function recordInPane(
  grid: CanvasGrid,
  pane: CanvasPane,
  record: Record<string, unknown>,
): boolean {
  return (
    matches(record, grid.rows, grid.rows.leaves[pane.row]) &&
    matches(record, grid.columns, grid.columns.leaves[pane.column])
  );
}
