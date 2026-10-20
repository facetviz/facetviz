import { MapSeries } from "../../series/map.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerMapSeries = () => registerSeriesType("map", MapSeries);
registerMapSeries();
export { MapSeries };
