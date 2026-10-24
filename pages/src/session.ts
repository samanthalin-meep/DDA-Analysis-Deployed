import type { Config, Dataset, Result, ElectrodeData } from "./types";

export type Source = {
  name: string;
  text: string;
  meta?: Pick<Dataset, "counts" | "preparation"> & {
    electrode_data?: ElectrodeData;
  };
};
export type Annotation = { file: string; time: number; label: string };

export function desktopConfig(
  config: Config,
  columns: string[],
  expert = false,
) {
  const names = config.indices.map((i) => columns[i]);
  return {
    expertMode: expert,
    variantIds: config.variants,
    ctPooled: config.variants.includes("CT") && !config.pairs?.length,
    eventOffsetSeconds: config.eventOffset,
    windowLengthSamples: config.window,
    windowStepSamples: config.step,
    delays: config.delays,
    modelTerms: config.terms,
    modelDimension: config.dimension,
    polynomialOrder: config.order,
    nrTau: config.nrTau,
    startTimeSeconds: config.start,
    endTimeSeconds: config.end,
    variantChannelNames: Object.fromEntries(
      config.variants.map((v) => [v, names]),
    ),
    variantChannelPairs: Object.fromEntries(
      config.variants.map((v) => [
        v,
        (config.pairs || []).map((p) => p.map((i) => columns[i])),
      ]),
    ),
  };
}

export function makeSession(
  files: Dataset[],
  dataset: Dataset | undefined,
  config: Config,
  result: Result | undefined,
  sources: Source[],
  annotations: Annotation[],
  expert: boolean,
  recipe = false,
) {
  const rc = result?.config || config;
  const resultColumns =
    files.find((d) => d.name === result?.file_name)?.columns ||
    dataset?.columns ||
    [];
  const reproduction = {
    ct_pooled: rc.variants.includes("CT") && !rc.pairs?.length,
    event_offset_seconds: rc.eventOffset,
    expert_mode: expert,
    variant_ids: rc.variants,
    selected_channel_indices: rc.indices,
    selected_channel_names: rc.indices.map((i) => resultColumns[i]),
    variant_channel_indices: Object.fromEntries(
      rc.variants.map((v) => [v, rc.indices]),
    ),
    variant_channel_names: Object.fromEntries(
      rc.variants.map((v) => [v, rc.indices.map((i) => resultColumns[i])]),
    ),
    variant_pair_indices: Object.fromEntries(
      rc.variants.map((v) => [v, rc.pairs || []]),
    ),
    variant_pair_names: {},
    window_length_samples: rc.window,
    window_step_samples: rc.step,
    delays: rc.delays,
    model_terms: rc.terms,
    model_dimension: rc.dimension,
    polynomial_order: rc.order,
    nr_tau: rc.nrTau,
    start_time_seconds: rc.start,
    end_time_seconds: rc.end,
  };
  const nativeResult = result
    ? {
        ...result,
        file_path: result.file_name,
        created_at_iso: result.created_at,
        engine_label: result.engine,
        diagnostics: [],
        is_fallback: false,
        reproduction,
        variants: result.variants.map((v) => ({
          ...v,
          summary: "",
          min_value: v.matrix.flat().reduce((a, x) => Math.min(a, x), Infinity),
          max_value: v.matrix
            .flat()
            .reduce((a, x) => Math.max(a, x), -Infinity),
          column_count: v.matrix[0]?.length || 0,
        })),
        trial_groups: result.trial_groups.map((g) => ({
          ...g,
          channel_indices: g.indices,
        })),
      }
    : null;
  return {
    createdAtIso: new Date().toISOString(),
    snapshotMode: recipe ? "recipe_only" : "full",
    openFiles: files.map((d) => d.name),
    activeFilePath: dataset?.name,
    selectedChannelNames: config.indices.map((i) => dataset?.columns[i]),
    ddaConfig: desktopConfig(config, dataset?.columns || [], expert),
    annotationsByFile: {},
    ddaResult: recipe ? null : nativeResult,
    icaResult: null,
    browser: {
      version: 1,
      config,
      result: recipe ? null : result,
      annotations,
      files: recipe ? [] : sources,
    },
  };
}
