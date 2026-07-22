import { SunburstSeries } from "../../series/sunburst.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerSunburstSeries = () => registerSeriesType("sunburst", SunburstSeries);
registerSunburstSeries();
export { SunburstSeries };
