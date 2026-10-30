import type { Result } from "./types";

export function resultTimeAxis(result?: Result): {
  timeUnit?: "ms";
  timeBounds?: [number, number];
} {
  if (!result?.trial_groups.length) return {};
  if (result.epoch_time_bounds_seconds)
    return { timeUnit: "ms", timeBounds: result.epoch_time_bounds_seconds };
  // Older runs stored window centers and settings but not the full epoch.
  const times = result.window_centers_seconds;
  const sampleStep = result.sampling_rate_hz ? 1 / result.sampling_rate_hz
    : times.length > 1 ? (times[1] - times[0]) / result.config.step : 1 / 250;
  const start = result.config.start - result.config.eventOffset;
  const end = result.config.end + sampleStep - result.config.eventOffset;
  return { timeUnit: "ms", timeBounds: [
    Math.min(start, times[0] ?? start),
    Math.max(end, times.at(-1) ?? end),
  ] };
}

export function nearestTimeIndex(time: number[], target: number, first = 0, last = time.length - 1): number {
  let lo = first, hi = last;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (time[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo > first && Math.abs(time[lo - 1] - target) <= Math.abs(time[lo] - target) ? lo - 1 : lo;
}
