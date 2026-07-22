import { SlopeSeries } from "../../series/slope.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerSlopeSeries = () => registerSeriesType("slope", SlopeSeries);
registerSlopeSeries();
export { SlopeSeries };
