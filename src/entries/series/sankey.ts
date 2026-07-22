import { SankeySeries } from "../../series/sankey.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerSankeySeries = () => registerSeriesType("sankey", SankeySeries);
registerSankeySeries();
export { SankeySeries };
