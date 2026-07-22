import { BulletSeries } from "../../series/bullet.js";
import { registerSeriesType } from "../../series/registry.js";
export const registerBulletSeries = () => registerSeriesType("bullet", BulletSeries);
registerBulletSeries();
export { BulletSeries };
