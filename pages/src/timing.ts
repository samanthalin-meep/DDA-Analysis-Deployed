import type { Config, Dataset, Result } from "./types";

type Preparation = Dataset["preparation"] | null;

export function preparedEventOffset(preparation: Preparation): number | undefined {
  if (!preparation) return undefined;
  // Older preparation metadata omitted the offset. That recipe also used
  // -200 to +800 ms epochs, exported with a time column starting at zero.
  const offset = preparation.event_offset_seconds ?? 0.2;
  return Number.isFinite(offset) ? offset : undefined;
}

export function configForPreparedData(config: Config, preparation: Preparation): Config {
  if (config.eventOffsetManual) return config;
  const offset = preparedEventOffset(preparation);
  return offset === undefined || offset === config.eventOffset
    ? config
    : { ...config, eventOffset: offset };
}

export function correctPreparedResultTiming(result: Result, preparation?: Preparation): Result {
  const offset = preparedEventOffset(result.preparation || preparation);
  // Correct only the known legacy default on confirmed prepared data.
  // Custom files and other explicitly saved offsets retain their timing.
  if (result.config?.eventOffsetManual || result.config?.eventOffset !== 1.2 || offset !== 0.2 ||
      !result.window_centers_seconds?.length ||
      !result.window_centers_seconds.every(Number.isFinite)) return result;
  return {
    ...result,
    config: { ...result.config, eventOffset: offset },
    window_centers_seconds: result.window_centers_seconds.map(
      (time) => time + (result.config.eventOffset - offset),
    ),
    timing_correction: {
      original_event_offset_seconds: result.config.eventOffset,
      corrected_event_offset_seconds: offset,
    },
  };
}
