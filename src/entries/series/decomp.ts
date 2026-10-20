import { DecompSeries } from "../../series/decomp.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerDecompSeries = () => registerSeriesType("decomp", DecompSeries);
registerDecompSeries();
export { DecompSeries };
