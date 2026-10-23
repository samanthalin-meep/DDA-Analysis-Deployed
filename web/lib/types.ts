export const CONDITIONS = ['control', 'exp1', 'exp2', 'exp3', 'exp4', 'exp5'] as const;
export const COLORS = ['#0b8d82', '#6366f1', '#ed8a45', '#cb5984', '#33a6c9', '#8b73bd'];
export type InputFile = {name: string; pathname: string; size: number; role: 'edf' | 'log' | 'conditions' | 'prepared'};
export type AnalysisConfig = {
  recordingId: string; electrodes: string[]; conditions: string[]; averageElectrodes: boolean;
  windowLength: number; windowStep: number; delays: number[]; modelTerms: number[];
  dimension: number; order: number; nrTau: number; eventOffset: number;
};
export const DEFAULT_CONFIG: AnalysisConfig = {
  recordingId: '', electrodes: ['E129'], conditions: [...CONDITIONS], averageElectrodes: true,
  windowLength: 50, windowStep: 10, delays: [7, 10], modelTerms: [1, 2, 10],
  dimension: 4, order: 4, nrTau: 2, eventOffset: 0.2,
};
export type Artifact = {name: string; pathname: string; size: number; kind: 'prepared' | 'counts' | 'result' | 'graph' | 'provenance'};
export type ConditionCount = {condition: string; all_events: number; artifact_flagged: number; exported_trials: number};
export type SignalResult = {
  signal: string; sampleRate: number; samples: number; trialCount: number;
  groups: {condition: string; trials: number; a1: number[]; coefficients?: number[][]}[];
  times: number[]; waveform: {time: number; value: number}[];
};
export type AnalysisResult = {recordingId: string; counts: ConditionCount[]; signals: SignalResult[]; preparation: Record<string, unknown>; engine: string};
export type Job = {
  id: string; session: string; config: AnalysisConfig; inputs: InputFile[]; sourceJobId?: string;
  status: 'queued' | 'initializing' | 'preparing' | 'analyzing' | 'complete' | 'failed';
  stage: string; progress: number; createdAt: string; updatedAt: string;
  sandboxId?: string; commandId?: string; phase?: 'setup' | 'waiting-runtime' | 'run';
  artifacts: Artifact[]; result?: AnalysisResult; error?: string;
};
export type PublicJob = Omit<Job, 'session' | 'sandboxId' | 'commandId' | 'phase' | 'inputs'>;
