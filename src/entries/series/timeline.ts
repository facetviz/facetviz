import { TimelineSeries } from "../../series/timeline.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerTimelineSeries = () => registerSeriesType("timeline", TimelineSeries);
registerTimelineSeries();
export { TimelineSeries };
