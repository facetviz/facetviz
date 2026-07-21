/** Runtime interaction state that is not part of declarative series options. */
import type { BaseSeries } from '../series/base.js';

export interface SeriesRuntimeState {
  visible: boolean;
  hiddenPoints: Set<number>;
}

export function captureSeriesState(series: BaseSeries[]): SeriesRuntimeState[] {
  return series.map((s) => ({
    visible: s.visible,
    hiddenPoints: new Set(s.hiddenPoints),
  }));
}

export function restoreSeriesState(
  series: BaseSeries[],
  state: SeriesRuntimeState[],
): void {
  series.forEach((s, i) => {
    const previous = state[i];
    if (!previous) return;
    s.visible = previous.visible;
    s.hiddenPoints = previous.hiddenPoints;
  });
}
