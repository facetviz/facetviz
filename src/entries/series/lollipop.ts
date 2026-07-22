import { LollipopSeries } from "../../series/lollipop.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerLollipopSeries = () => registerSeriesType("lollipop", LollipopSeries);
registerLollipopSeries();
export { LollipopSeries };
