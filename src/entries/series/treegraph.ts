import { TreegraphSeries } from "../../series/treegraph.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerTreegraphSeries = () => registerSeriesType("treegraph", TreegraphSeries);
registerTreegraphSeries();
export { TreegraphSeries };
