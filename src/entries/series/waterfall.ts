import { WaterfallSeries } from "../../series/waterfall.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerWaterfallSeries = () => registerSeriesType("waterfall", WaterfallSeries);
registerWaterfallSeries();
export { WaterfallSeries };
