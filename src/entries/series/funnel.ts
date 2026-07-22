import { FunnelSeries } from "../../series/funnel.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerFunnelSeries = () => registerSeriesType("funnel", FunnelSeries);
registerFunnelSeries();
export { FunnelSeries };
