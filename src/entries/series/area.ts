import { AreaSeries } from "../../series/area.js";
import { registerSeriesTypes } from "../../series/registry.js";
export const registerAreaSeries = () => registerSeriesTypes(["area", "areaspline"], AreaSeries);
registerAreaSeries();
export { AreaSeries };
