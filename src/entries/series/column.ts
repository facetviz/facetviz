import { ColumnSeries } from "../../series/column.js";
import { registerSeriesTypes } from "../../series/registry.js";
export const registerColumnSeries = () => registerSeriesTypes(["bar", "column", "butterfly"], ColumnSeries);
registerColumnSeries();
export { ColumnSeries };
