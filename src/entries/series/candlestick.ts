import { CandlestickSeries } from "../../series/candlestick.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerCandlestickSeries = () => registerSeriesType("candlestick", CandlestickSeries);
registerCandlestickSeries();
export { CandlestickSeries };
