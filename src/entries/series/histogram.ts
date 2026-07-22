import { HistogramSeries } from "../../series/histogram.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerHistogramSeries = () => registerSeriesType("histogram", HistogramSeries);
registerHistogramSeries();
export { HistogramSeries };
