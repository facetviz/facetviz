import { TreemapSeries } from "../../series/treemap.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerTreemapSeries = () => registerSeriesType("treemap", TreemapSeries);
registerTreemapSeries();
export { TreemapSeries };
