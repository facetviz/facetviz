import { RangeSeries } from "../../series/range.js";
import { registerSeriesTypes } from "../../series/registry.js";
export const registerRangeSeries = () => registerSeriesTypes(["arearange", "areasplinerange"], RangeSeries);
registerRangeSeries();
export { RangeSeries };
