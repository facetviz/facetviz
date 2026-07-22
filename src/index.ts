/**
 * Full, backward-compatible FacetViz entrypoint. Importing this module registers
 * every built-in renderer. Use `facetviz/core` plus selected series modules for
 * a smaller tree-shakable bundle.
 */

import "./series/register-all.js";

export * from "./api.js";
export { computeBoxStats } from "./series/boxplot.js";
export { registerAllSeries } from "./series/register-all.js";
