"""Waveform selection, averaging, and saved individual-signal round trips."""
import base64
import copy
import json
import unittest

import numpy as np
import workspace as w


class WaveformTests(unittest.TestCase):
    def setUp(self):
        w.datasets.clear()
        self.electrodes = ['E1', 'E2', 'E3']
        self.source = 'AVG_' + '_'.join(self.electrodes)
        self.columns = [f'{self.source}__{condition}__trial_event{i+1:06d}'
                        for i, condition in enumerate(['control']*3 + ['exp1']*2)]
        self.time = np.arange(8)/250
        self.values = (np.arange(120, dtype=np.float32).reshape(3, 8, 5)/7 - 3)
        self.matrix = self.values.astype(float).mean(axis=0)
        self.info = w.register('DDA_Test_01.csv', self.matrix, self.time, self.columns,
                               preparation={'recording': 'Test_01'}, electrodes=self.electrodes,
                               electrode_data=self.values)
        self.did = self.info['id']
        self.original = w.export_dataset(self.did)

    def view(self, **kwargs):
        return json.loads(w.preview(self.did, json.dumps(dict(indices=[0, 1, 2], start=0, end=.028, **kwargs))))

    def test_selected_electrodes_and_trials(self):
        one = self.view(electrodes=['E2'], mode='separate')
        np.testing.assert_array_equal(one['values'], self.values[1, :, :3].T)
        self.assertTrue(one['names'][0].startswith('E2__control__'))
        multiple = self.view(electrodes=['E3', 'E1'], mode='separate')
        np.testing.assert_array_equal(multiple['values'], self.values[[0, 2], :, :3].astype(float).mean(axis=0).T)
        self.assertEqual(multiple['source'], 'AVG_E1_E3')
        avg = self.view(electrodes=['E1', 'E3'], mode='mean')
        np.testing.assert_allclose(avg['values'][0], self.values[[0, 2], :, :3].astype(float).mean(axis=0).mean(axis=1), rtol=0, atol=1e-14)
        self.assertEqual(avg['names'], ['control · Mean of 3 trials'])
        all_electrodes = self.view(electrodes=self.electrodes, mode='separate')
        np.testing.assert_array_equal(all_electrodes['values'], self.matrix[:, :3].T)
        single = json.loads(w.preview(self.did, json.dumps({'indices': [2], 'electrodes': ['E3'], 'mode': 'single'})))
        np.testing.assert_array_equal(single['values'][0], self.values[2, :, 2])

    def test_conditions_never_mix_and_all_trials_are_returned(self):
        config = {'indices': [4, 0, 3, 2, 1], 'electrodes': ['E1'], 'mode': 'mean'}
        p = json.loads(w.preview(self.did, json.dumps(config)))
        self.assertEqual(p['names'], ['control · Mean of 3 trials', 'exp1 · Mean of 2 trials'])
        np.testing.assert_allclose(p['values'][0], self.values[0, :, :3].astype(float).mean(axis=1))
        np.testing.assert_allclose(p['values'][1], self.values[0, :, 3:].astype(float).mean(axis=1))
        # More than the former 12-trace cap, with no omitted or merged trials.
        columns = [f'E1__control__trial_{i}' for i in range(40)]
        matrix = np.arange(320).reshape(8, 40)
        d = w.register('forty.csv', matrix, self.time, columns)
        p = json.loads(w.preview(d['id'], json.dumps({'indices': list(range(40)), 'mode': 'separate'})))
        np.testing.assert_array_equal(p['values'], matrix.T)

    def test_preview_does_not_change_dda_or_exports(self):
        cfg = {'indices': [0, 1, 3, 4], 'variants': ['CT'], 'window': 1, 'step': 1,
               'delays': [1], 'dimension': 1, 'nrTau': 1, 'order': 1, 'terms': [1], 'eventOffset': 1.2}
        spec = w.analysis_spec(self.did, json.dumps(cfg))
        before = w.analysis_matrix(self.did, '[0,1,3,4]', 0, 8).copy()
        for mode in ['single', 'mean', 'separate']:
            self.view(electrodes=['E2'], mode=mode)
        self.assertEqual(w.export_dataset(self.did), self.original)
        self.assertEqual(w.analysis_spec(self.did, json.dumps(cfg)), spec)
        np.testing.assert_array_equal(w.analysis_matrix(self.did, '[0,1,3,4]', 0, 8), before)
        self.assertEqual(w.datasets[self.did]['columns'], self.columns)

    def test_saved_signal_round_trip_and_legacy_average(self):
        stored = json.loads(w.export_electrodes(self.did))
        meta = json.dumps({'preparation': {'recording': 'Test_01'}, 'electrode_data': stored})
        restored = json.loads(w.open_csv('DDA_Test_01.csv', self.original, 250, meta))
        self.assertEqual(restored['electrodes'], self.electrodes)
        self.assertEqual(restored['preparation']['recording'], 'Test_01')
        np.testing.assert_array_equal(w.datasets[restored['id']]['electrode_data'], self.values)
        config = json.dumps({'electrodes': ['E1', 'E2'], 'indices': [0, 2], 'mode': 'mean'})
        self.assertEqual(w.preview(restored['id'], config), w.preview(self.did, config))
        self.assertEqual(w.export_dataset(restored['id']), self.original)
        legacy = json.loads(w.open_csv('legacy.csv', self.original))
        self.assertEqual(legacy['electrodes'], [])
        self.assertIsNone(json.loads(w.export_electrodes(legacy['id'])))
        with self.assertRaisesRegex(ValueError, 'Upload the recording again'):
            w.preview(legacy['id'], config)

    def test_empty_and_invalid_selections_and_corrupt_storage(self):
        self.assertEqual(self.view(electrodes=[], mode='mean')['values'], [])
        self.assertEqual(json.loads(w.preview(self.did, '{"indices":[],"mode":"mean"}'))['values'], [])
        for config in [{'indices': [-1]}, {'indices': [0, 0]}, {'indices': [True]},
                       {'indices': [99]}, {'mode': 'unknown'}, {'electrodes': ['E4']},
                       {'electrodes': ['E1', 'E1']}, {'start': .02, 'end': 0}]:
            with self.assertRaises(ValueError):
                w.preview(self.did, json.dumps(config))
        stored = json.loads(w.export_electrodes(self.did))
        for change in [{'encoding': 'unknown'}, {'values': 'bad!'},
                       {'values': base64.b64encode(np.zeros_like(self.values).tobytes()).decode()},
                       {'electrodes': ['E1', 'E2', 'E4']}]:
            broken = copy.deepcopy(stored); broken.update(change)
            count = len(w.datasets)
            with self.assertRaises(Exception):
                w.open_csv('broken.csv', self.original, 250, json.dumps({'electrode_data': broken}))
            self.assertEqual(len(w.datasets), count, 'A rejected restore must not leave a partial dataset.')


suite = unittest.defaultTestLoader.loadTestsFromTestCase(WaveformTests)
result = unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():
    raise AssertionError('Waveform checks failed.')
