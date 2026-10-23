import { AnalysisConfig, CONDITIONS, InputFile } from './types';
export function validateConfig(input: unknown): AnalysisConfig {
  if (!input || typeof input !== 'object') throw new Error('Choose preparation settings.');
  const c = input as AnalysisConfig;
  if (typeof c.recordingId !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(c.recordingId)) throw new Error('Recording ID: use up to 64 letters, numbers, or underscores.');
  if (!Array.isArray(c.electrodes) || !c.electrodes.length || c.electrodes.length > 129 || c.electrodes.some(e => !/^E([1-9]|[1-9]\d|1[01]\d|12\d)$/.test(e)) || new Set(c.electrodes).size !== c.electrodes.length) throw new Error('Choose unique electrodes from E1 to E129.');
  if (!Array.isArray(c.conditions) || !c.conditions.length || c.conditions.some(x => !(CONDITIONS as readonly string[]).includes(x)) || new Set(c.conditions).size !== c.conditions.length) throw new Error('Choose at least one condition.');
  if (typeof c.averageElectrodes !== 'boolean') throw new Error('Choose an electrode export mode.');
  for (const [key, min, max] of [['windowLength', 8, 10000], ['windowStep', 1, 10000], ['dimension', 1, 12], ['order', 1, 8], ['nrTau', 1, 8]] as const) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`Invalid ${key}.`);
  }
  if (!Array.isArray(c.delays) || c.delays.length !== c.nrTau || c.delays.some(x => !Number.isInteger(x) || x < 1 || x > 10000)) throw new Error('Enter one positive sample delay for each delay term.');
  if (!Array.isArray(c.modelTerms) || !c.modelTerms.length || c.modelTerms.length > 32 || c.modelTerms.some(x => !Number.isInteger(x) || x < 1 || x > 10000) || new Set(c.modelTerms).size !== c.modelTerms.length) throw new Error('Enter unique positive model-term indices.');
  if (!Number.isFinite(c.eventOffset) || Math.abs(c.eventOffset) > 1000) throw new Error('Enter a valid event offset in seconds.');
  return {...c, electrodes: [...c.electrodes], conditions: [...c.conditions]};
}
export function validateInputs(files: InputFile[], session: string, prepared = false) {
  const roles = prepared ? ['prepared'] : ['edf', 'log', 'conditions'];
  if (!Array.isArray(files) || files.length !== roles.length || roles.some(role => files.filter(f => f.role === role).length !== 1)) throw new Error(prepared ? 'Choose one prepared data CSV.' : 'Choose one EDF, one acquisition TXT log, and one conditions CSV.');
  for (const f of files) {
    if (typeof f.pathname !== 'string' || !f.pathname.startsWith(`sessions/${session}/uploads/`) || f.pathname.includes('..')) throw new Error('This upload does not belong to your session.');
    const max = f.role === 'edf' ? 512 * 1024 ** 2 : f.role === 'prepared' ? 64 * 1024 ** 2 : 10 * 1024 ** 2;
    if (!Number.isSafeInteger(f.size) || f.size <= 0 || f.size > max) throw new Error(`${f.name}: file size is outside the supported range.`);
    if (typeof f.name !== 'string' || f.name.length > 255 || /[\/\\\x00]/.test(f.name)) throw new Error('Invalid filename.');
    const ext = f.role === 'edf' ? '.edf' : f.role === 'log' ? '.txt' : '.csv';
    if (!f.name.toLowerCase().endsWith(ext)) throw new Error(`${f.name}: expected ${ext}.`);
  }
}
