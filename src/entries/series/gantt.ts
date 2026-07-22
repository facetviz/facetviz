import { GanttSeries } from "../../series/gantt.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerGanttSeries = () => registerSeriesType("gantt", GanttSeries);
registerGanttSeries();
export { GanttSeries };
