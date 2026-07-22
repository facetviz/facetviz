/** Runtime series registry. Concrete renderers are registered by entry modules. */

import type { ChartType, SeriesOptions } from "../core/options.js";
import type { BaseSeries } from "./base.js";

export type SeriesConstructor = new (
  options: SeriesOptions,
  categories?: string[],
) => BaseSeries;

const REGISTRY: Record<string, SeriesConstructor> = Object.create(null);

export function createSeries(
  type: ChartType,
  options: SeriesOptions,
  categories?: string[],
): BaseSeries {
  const Ctor = REGISTRY[type];
  if (!Ctor) {
    throw new Error(
      `FacetViz: unknown series type "${type}". ` +
      `Import "facetviz/series/all" or the matching "facetviz/series/<family>" module.`,
    );
  }
  return new Ctor(options, categories);
}

/** Register or replace one custom/built-in series type. */
export function registerSeriesType(
  type: string,
  ctor: SeriesConstructor,
): void {
  REGISTRY[type] = ctor;
}

/** Register several chart aliases backed by the same renderer. */
export function registerSeriesTypes(
  types: readonly string[],
  ctor: SeriesConstructor,
): void {
  for (const type of types) registerSeriesType(type, ctor);
}

/** Whether a built-in or runtime-registered series type is available. */
export function isSeriesTypeRegistered(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type);
}
