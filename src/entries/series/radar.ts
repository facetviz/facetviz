import { RadarSeries } from "../../series/radar.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerRadarSeries = () => registerSeriesType("radar", RadarSeries);
registerRadarSeries();
export { RadarSeries };
