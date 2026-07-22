import { BubbleSeries } from "../../series/bubble.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerBubbleSeries = () => registerSeriesType("bubble", BubbleSeries);
registerBubbleSeries();
export { BubbleSeries };
