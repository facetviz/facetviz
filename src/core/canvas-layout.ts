/**
 * Canvas layout: places a {@link CanvasGrid} in a rectangle. Header levels
 * and axis bands are fixed-size bands (measured or set by the caller); the
 * panes share what's left. From the outside in:
 *
 *   ┌──────────────┬──────────┬───────────────────────────┬──────────┐
 *   │              │          │ column header levels       │          │  top
 *   │              │          ├───────────────────────────┤          │
 *   │              │          │ top axis band              │          │
 *   ├──────────────┼──────────┼───────────────────────────┼──────────┤
 *   │ row header   │ left     │ panes                      │ right    │
 *   │ levels       │ axis band│ (rows × columns, gaps)     │ axis band│
 *   ├──────────────┼──────────┼───────────────────────────┼──────────┤
 *   │              │          │ bottom axis band           │          │
 *   └──────────────┴──────────┴───────────────────────────┴──────────┘
 *
 * Fit "entire" (the default) stretches panes both ways to fill the room;
 * "width" fits pane columns to the width and gives pane rows a fixed height,
 * "height" the other way round, "standard" fixes both. Each pane row or
 * column gets a share (or, fixed, a size) by weight: by default its number of
 * categories when its category axis is nested (so bars keep one width across
 * panes), else 1. A fixed size is `cell` px per weight; `natural` says how
 * big the outer rectangle would have to be to hold it all.
 */

import type { Rect } from "./axis.js";
import type { CanvasGrid, CanvasHeaderCell, CanvasTrack } from "./canvas-grid.js";

export interface CanvasBands {
  /** Width of each row header level, outer first. Default 0 each. */
  rowHeaders?: number[];
  /** Height of each column header level, outer first. Default 0 each. */
  columnHeaders?: number[];
  /** Thickness of the axis band (or plain padding) on each side of the panes. */
  axes?: { left?: number; right?: number; top?: number; bottom?: number };
  /** Space between neighbouring pane rows / columns. Default 0. */
  gap?: { rows?: number; columns?: number };
  /** Share of the room each pane row / column takes; defaults as described above. */
  weights?: { rows?: number[]; columns?: number[] };
  /**
   * Where column header levels sit: above the panes (default) or below them.
   * Either way the outermost level is farthest from the panes, beyond the
   * axis band on that side.
   */
  columnHeaderSide?: "top" | "bottom";
  /** Where row header levels sit: left of the panes (default) or right. */
  rowHeaderSide?: "left" | "right";
  /** How panes take the room; see above. Default "entire". */
  fit?: CanvasFit;
  /**
   * Fixed pane sizes, px per weight: `width` per pane column (default 200),
   * or per category where the columns have a category axis (default 40);
   * `height` per pane row (default 160, or 24 per category).
   */
  cell?: { width?: number; height?: number };
}

export type CanvasFit = "entire" | "width" | "height" | "standard";

export interface CanvasPlacedCell {
  /** The header level's field. */
  field: string;
  cell: CanvasHeaderCell;
  rect: Rect;
}

export interface CanvasLayout {
  /** The region the panes cover, gaps included. */
  plotArea: Rect;
  /** Each pane row's top and height. */
  rows: Array<{ y: number; height: number }>;
  /** Each pane column's left and width. */
  columns: Array<{ x: number; width: number }>;
  /** Pane rects, in the grid's (row-major) order. */
  panes: Array<{ key: string; row: number; column: number; rect: Rect }>;
  /** Header cells with their rects, one list per level, outer first. */
  headers: { rows: CanvasPlacedCell[][]; columns: CanvasPlacedCell[][] };
  /** Axis band rects: left/right one per pane row, top/bottom one per pane column. */
  axisBands: { left: Rect[]; right: Rect[]; top: Rect[]; bottom: Rect[] };
  /** The outer size that holds everything (the given size when panes fill it). */
  natural: { width: number; height: number };
}

/** Default share of each leaf: its categories when they're its own (nested), else 1. */
function defaultWeights(track: CanvasTrack): number[] {
  if (!byCategories(track)) return track.leaves.map(() => 1);
  const counts = track.leaves.map((l) => l.categories?.length ?? 0);
  // Crossed categories are the same everywhere: equal shares.
  return counts.map((c) => Math.max(1, c));
}

/** Fixed-size weights: a leaf's categories when the track has a category axis, else 1. */
function fixedWeights(track: CanvasTrack): number[] {
  return track.category ? track.leaves.map((l) => Math.max(1, l.categories?.length ?? 0)) : track.leaves.map(() => 1);
}

/** Whether a track's leaves are weighted by their own (nested, unequal) categories. */
function byCategories(track: CanvasTrack): boolean {
  if (!track.category) return false;
  const counts = track.leaves.map((l) => l.categories?.length ?? 0);
  return !counts.every((c) => c === counts[0]);
}

/**
 * Splits `[start, start + size]` among `weights` with `gap` between parts.
 * One part gets exactly `size` (no rounding drift), which keeps a lone pane
 * where the plot was before.
 */
function split(start: number, size: number, weights: number[], gap: number, fixed?: number): Array<[number, number]> {
  const n = weights.length;
  if (fixed !== undefined) {
    // Fixed: each part `fixed` px per weight, one after another.
    const out: Array<[number, number]> = [];
    let at = start;
    for (const w of weights) {
      const len = Math.max(0, w) * fixed;
      out.push([at, len]);
      at += len + gap;
    }
    return out;
  }
  if (n === 1) return [[start, Math.max(0, size)]];
  const room = Math.max(0, size - gap * (n - 1));
  // No positive weight at all: equal shares.
  const shares = weights.some((w) => w > 0) ? weights.map((w) => Math.max(0, w)) : weights.map(() => 1);
  const total = shares.reduce((a, b) => a + b, 0);
  const out: Array<[number, number]> = [];
  let at = start;
  for (const w of shares) {
    const len = (room * w) / total;
    out.push([at, len]);
    at += len + gap;
  }
  return out;
}

export function layoutCanvas(grid: CanvasGrid, outer: Rect, bands: CanvasBands = {}): CanvasLayout {
  const rowHeaderW = grid.rows.headers.map((_, i) => bands.rowHeaders?.[i] ?? 0);
  const colHeaderH = grid.columns.headers.map((_, i) => bands.columnHeaders?.[i] ?? 0);
  const left = bands.axes?.left ?? 0;
  const right = bands.axes?.right ?? 0;
  const top = bands.axes?.top ?? 0;
  const bottom = bands.axes?.bottom ?? 0;
  const headersW = rowHeaderW.reduce((a, b) => a + b, 0);
  const headersH = colHeaderH.reduce((a, b) => a + b, 0);

  const colTop = (bands.columnHeaderSide ?? "top") === "top";
  const rowLeft = (bands.rowHeaderSide ?? "left") === "left";
  // Same order of operations as the single-panel inset (x + left,
  // width - left - right), so a lone pane lands on exactly the same pixels.
  const plotArea: Rect = {
    x: outer.x + (rowLeft ? headersW : 0) + left,
    y: outer.y + (colTop ? headersH : 0) + top,
    width: outer.width - headersW - left - right,
    height: outer.height - headersH - top - bottom,
  };

  const fit = bands.fit ?? "entire";
  const fixedRows = fit === "width" || fit === "standard";
  const fixedCols = fit === "height" || fit === "standard";
  // A fixed size on a category axis is per category, even where every pane
  // has the same number of them.
  const rowWeights = bands.weights?.rows ?? (fixedRows ? fixedWeights(grid.rows) : defaultWeights(grid.rows));
  const colWeights = bands.weights?.columns ?? (fixedCols ? fixedWeights(grid.columns) : defaultWeights(grid.columns));
  const rowGap = bands.gap?.rows ?? 0;
  const colGap = bands.gap?.columns ?? 0;
  const rowUnit = fixedRows ? bands.cell?.height ?? (grid.rows.category ? 24 : 160) : undefined;
  const colUnit = fixedCols ? bands.cell?.width ?? (grid.columns.category ? 40 : 200) : undefined;
  const rows = split(plotArea.y, plotArea.height, rowWeights, rowGap, rowUnit).map(([y, height]) => ({ y, height }));
  const columns = split(plotArea.x, plotArea.width, colWeights, colGap, colUnit).map(([x, width]) => ({ x, width }));
  // Fixed panes set the plot area's size, whatever room there was.
  const extent = (parts: Array<{ len: number }>, gap: number) =>
    parts.reduce((a, p) => a + p.len, 0) + gap * Math.max(0, parts.length - 1);
  if (fixedCols) plotArea.width = extent(columns.map((c) => ({ len: c.width })), colGap);
  if (fixedRows) plotArea.height = extent(rows.map((r) => ({ len: r.height })), rowGap);

  const panes = grid.panes.map((p) => ({
    key: p.key,
    row: p.row,
    column: p.column,
    rect: { x: columns[p.column].x, y: rows[p.row].y, width: columns[p.column].width, height: rows[p.row].height },
  }));

  // Header levels from the outside in: level i starts past every level
  // outside it (before it on the far side of the panes).
  const sum = (list: number[], from: number, to: number) => list.slice(from, to).reduce((a, b) => a + b, 0);
  const rowX = (i: number) => rowLeft
    ? outer.x + sum(rowHeaderW, 0, i)
    : plotArea.x + plotArea.width + right + sum(rowHeaderW, i + 1, rowHeaderW.length);
  const colY = (i: number) => colTop
    ? outer.y + sum(colHeaderH, 0, i)
    : plotArea.y + plotArea.height + bottom + sum(colHeaderH, i + 1, colHeaderH.length);

  // A header cell runs from its first leaf's start to its last leaf's end.
  const rowHeaders = grid.rows.headers.map((level, i) => {
    const x = rowX(i);
    return level.cells.map((cell) => {
      const first = rows[cell.start];
      const last = rows[cell.start + cell.span - 1];
      return { field: level.field, cell, rect: { x, y: first.y, width: rowHeaderW[i], height: last.y + last.height - first.y } };
    });
  });
  const columnHeaders = grid.columns.headers.map((level, i) => {
    const y = colY(i);
    return level.cells.map((cell) => {
      const first = columns[cell.start];
      const last = columns[cell.start + cell.span - 1];
      return { field: level.field, cell, rect: { x: first.x, y, width: last.x + last.width - first.x, height: colHeaderH[i] } };
    });
  });

  const axisBands = {
    left: rows.map((r) => ({ x: plotArea.x - left, y: r.y, width: left, height: r.height })),
    right: rows.map((r) => ({ x: plotArea.x + plotArea.width, y: r.y, width: right, height: r.height })),
    top: columns.map((c) => ({ x: c.x, y: plotArea.y - top, width: c.width, height: top })),
    bottom: columns.map((c) => ({ x: c.x, y: plotArea.y + plotArea.height, width: c.width, height: bottom })),
  };

  const natural = {
    width: fixedCols ? headersW + left + right + plotArea.width : outer.width,
    height: fixedRows ? headersH + top + bottom + plotArea.height : outer.height,
  };
  return { plotArea, rows, columns, panes, headers: { rows: rowHeaders, columns: columnHeaders }, axisBands, natural };
}
