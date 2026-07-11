/**
 * Marimekko (mosaic) series. Variable-width 100% stacked columns — column width
 * encodes each category's total across all series, and within a column the
 * segments are that series' share. Laid out across series by the chart
 * (`renderMarimekkoPanel`); this class just holds the data.
 */

import { BaseSeries, SeriesCapabilities, SeriesRenderContext } from './base.js';

export class MarimekkoSeries extends BaseSeries {
  override capabilities(): SeriesCapabilities {
    return { grouped: false, cartesian: false, stackable: false };
  }
  // Drawn by the chart-level marimekko renderer.
  override render(_ctx: SeriesRenderContext): void {}
}
