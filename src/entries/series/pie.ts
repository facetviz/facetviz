import { PieSeries } from "../../series/pie.js";
import { registerSeriesTypes } from "../../series/registry.js";
export const registerPieSeries = () => registerSeriesTypes(["pie", "donut"], PieSeries);
registerPieSeries();
export { PieSeries };
