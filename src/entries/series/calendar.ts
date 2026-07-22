import { CalendarSeries } from "../../series/calendar.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerCalendarSeries = () => registerSeriesType("calendar", CalendarSeries);
registerCalendarSeries();
export { CalendarSeries };
