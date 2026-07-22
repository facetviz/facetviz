import { ErrorBarSeries } from "../../series/errorbar.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerErrorBarSeries = () => registerSeriesType("errorbar", ErrorBarSeries);
registerErrorBarSeries();
export { ErrorBarSeries };
