import { MarimekkoSeries } from "../../series/marimekko.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerMarimekkoSeries = () => registerSeriesType("marimekko", MarimekkoSeries);
registerMarimekkoSeries();
export { MarimekkoSeries };
