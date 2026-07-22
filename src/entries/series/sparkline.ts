import { SparklineSeries } from "../../series/sparkline.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerSparklineSeries = () => registerSeriesType("sparkline", SparklineSeries);
registerSparklineSeries();
export { SparklineSeries };
