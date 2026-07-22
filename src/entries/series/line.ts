import { LineSeries } from "../../series/line.js";
import { registerSeriesTypes } from "../../series/registry.js";
export const registerLineSeries = () => registerSeriesTypes(["line", "spline", "step"], LineSeries);
registerLineSeries();
export { LineSeries };
