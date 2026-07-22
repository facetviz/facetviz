import { BoxplotSeries, computeBoxStats } from "../../series/boxplot.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerBoxplotSeries = () => registerSeriesType("boxplot", BoxplotSeries);
registerBoxplotSeries();
export { BoxplotSeries, computeBoxStats };
