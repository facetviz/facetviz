/**
 * Radar (spider) series. Radar charts share one polar frame across all their
 * series, so the actual drawing is done by the chart (`renderRadarPanel`); this
 * class just holds the normalised points and per-series options.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';

export class RadarSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }
  // Drawn by the chart-level radar renderer.
  override render(_ctx: SeriesRenderContext): void {}
}
