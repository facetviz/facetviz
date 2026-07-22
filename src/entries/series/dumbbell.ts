import { DumbbellSeries } from "../../series/dumbbell.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerDumbbellSeries = () => registerSeriesType("dumbbell", DumbbellSeries);
registerDumbbellSeries();
export { DumbbellSeries };
