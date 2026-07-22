import { RadialBarSeries } from "../../series/radialbar.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerRadialBarSeries = () => registerSeriesType("radialbar", RadialBarSeries);
registerRadialBarSeries();
export { RadialBarSeries };
