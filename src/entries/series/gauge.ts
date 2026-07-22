import { GaugeSeries } from "../../series/gauge.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerGaugeSeries = () => registerSeriesType("gauge", GaugeSeries);
registerGaugeSeries();
export { GaugeSeries };
