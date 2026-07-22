import { ScatterSeries } from "../../series/scatter.js";
import { registerSeriesTypes } from "../../series/registry.js";
export const registerScatterSeries = () => registerSeriesTypes(["scatter", "jitter"], ScatterSeries);
registerScatterSeries();
export { ScatterSeries };
