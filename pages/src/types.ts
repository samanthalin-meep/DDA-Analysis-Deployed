export type Group = { electrode: string; condition: string; indices: number[] };
export type Dataset = {
  id: string;
  name: string;
  columns: string[];
  rows: number;
  rate: number;
  duration: number;
  start: number;
  groups: Group[];
  counts: Record<string, string | number>[];
  electrodes?: string[];
  preparation?: {
    recording?: string;
    event_sample_offset?: number;
    event_offset_seconds?: number;
    bad_channels: string[];
    epochs: number;
    global_sd: number;
    rejected_events: number[];
  };
};
export type ElectrodeData = {
  encoding: "f32le-base64";
  electrodes: string[];
  values: string;
};
export type Config = {
  window: number;
  step: number;
  start: number;
  end: number;
  eventOffset: number;
  eventOffsetManual?: boolean;
  electrodeAveraging?: "signal" | "coefficients";
  delays: number[];
  terms: number[];
  dimension: number;
  order: number;
  nrTau: number;
  indices: number[];
  variants: string[];
  pairs?: number[][];
  conditioningStrategy?: string;
  temporalLambda?: number;
  maxActiveSources?: number;
  surrogateShifts?: number[];
};
export type Variant = {
  id: string;
  label: string;
  matrix: number[][];
  row_labels: string[];
};
export type Result = {
  id: string;
  file_name: string;
  created_at: string;
  variants: Variant[];
  window_centers_seconds: number[];
  trial_groups: Group[];
  config: Config;
  engine: string;
  preparation?: Dataset["preparation"];
  electrode_results?: { electrode: string; variants: Variant[] }[];
  timing_correction?: {
    original_event_offset_seconds: number;
    corrected_event_offset_seconds: number;
  };
};
export type Preview = { time: number[]; names: string[]; values: number[][]; source: string; trials: number };
export const defaultConfig: Config = {
  window: 50,
  step: 10,
  start: 0,
  end: 0.996,
  eventOffset: 0.2,
  electrodeAveraging: "coefficients",
  delays: [7, 10],
  terms: [1, 2, 10],
  dimension: 4,
  order: 4,
  nrTau: 2,
  indices: [],
  variants: ["CT"],
};
