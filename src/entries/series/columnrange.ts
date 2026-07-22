import { ColumnRangeSeries } from "../../series/columnrange.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerColumnRangeSeries = () => registerSeriesType("columnrange", ColumnRangeSeries);
registerColumnRangeSeries();
export { ColumnRangeSeries };
