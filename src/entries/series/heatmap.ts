import { HeatmapSeries } from "../../series/heatmap.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerHeatmapSeries = () => registerSeriesType("heatmap", HeatmapSeries);
registerHeatmapSeries();
export { HeatmapSeries };
