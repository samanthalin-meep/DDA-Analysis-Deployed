import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig, validateInputs} from '../lib/validation';
import {DEFAULT_CONFIG} from '../lib/types';
const config = {...DEFAULT_CONFIG, recordingId:'I1_R3'};
test('accepts the preparation recipe and actual electrode boundaries', () => {
  assert.deepEqual(validateConfig({...config,electrodes:['E1','E129']}), {...config,electrodes:['E1','E129']});
});
test('rejects invalid electrode indices, duplicate trials selections, and unsafe recording IDs', () => {
  for (const electrodes of [['E0'],['E130'],['E129','E129'],[]]) assert.throws(() => validateConfig({...config,electrodes}));
  assert.throws(() => validateConfig({...config,recordingId:'../../other'}));
  assert.throws(() => validateConfig({...config,conditions:['control','control']}));
});
test('rejects nonfinite and mismatched scientific settings before compute starts', () => {
  assert.throws(() => validateConfig({...config,eventOffset:NaN}));
  assert.throws(() => validateConfig({...config,nrTau:3}));
  assert.throws(() => validateConfig({...config,modelTerms:[1,1,10]}));
  assert.throws(() => validateConfig({...config,windowLength:0}));
});
test('rejects another session’s upload and wrong file roles', () => {
  const files = [{name:'recording.edf',pathname:'sessions/abc/uploads/id/recording.edf',size:131000000,role:'edf' as const},{name:'log.txt',pathname:'sessions/abc/uploads/id/log.txt',size:1000,role:'log' as const},{name:'conditions.csv',pathname:'sessions/abc/uploads/id/conditions.csv',size:1000,role:'conditions' as const}];
  assert.doesNotThrow(() => validateInputs(files,'abc'));
  assert.throws(() => validateInputs(files,'different'));
  assert.throws(() => validateInputs([files[0],files[0],files[2]],'abc'));
  assert.throws(() => validateInputs([{...files[0],pathname:'sessions/abc/uploads/../other'},...files.slice(1)],'abc'));
});
