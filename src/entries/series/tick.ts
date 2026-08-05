import { TickSeries } from "../../series/tick.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerTickSeries = () => registerSeriesType("tick", TickSeries);
registerTickSeries();
export { TickSeries };
