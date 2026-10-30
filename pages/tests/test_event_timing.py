"""Check event timing through the same Python runtime used by the app."""
import json
import unittest

import numpy as np
import workspace as w


class EventTimingTests(unittest.TestCase):
    def setUp(self):
        w.datasets.clear()
        self.time = np.arange(250)/250
        self.matrix = np.column_stack((np.sin(self.time*10), np.cos(self.time*11)))
        self.columns = ['E1__control__trial_event000001', 'E1__control__trial_event000002']
        self.config = dict(indices=[0, 1], variants=['CT'], start=0, end=.996,
                           window=50, step=10, delays=[7, 10], dimension=4,
                           nrTau=2, order=4, terms=[1, 2, 10], eventOffset=1.2)

    def spec(self, prep=None, **changes):
        info = w.register('timing.csv', self.matrix, self.time, self.columns, preparation=prep)
        cfg = dict(self.config, **changes)
        spec = json.loads(w.analysis_spec(info['id'], json.dumps(cfg)))
        np.testing.assert_array_equal(w.analysis_matrix(info['id'], '[0,1]', spec['start'], spec['end']), self.matrix.ravel())
        return spec

    def test_prepared_and_legacy_metadata_override_stale_default(self):
        for prep in [{'recording': 'Timing'}, {'recording': 'Timing', 'event_offset_seconds': .2}]:
            spec = self.spec(prep)
            self.assertEqual(spec['event_offset_seconds'], .2)
            self.assertEqual(len(spec['centers']), 19)
            self.assertAlmostEqual(spec['centers'][0], -.046)
            self.assertAlmostEqual(spec['centers'][-1], .674)
            corrected_config = self.spec(prep, eventOffset=.2)
            self.assertEqual(spec, corrected_config)

    def test_explicit_preparation_metadata_is_authoritative(self):
        spec = self.spec({'recording': 'OtherRecipe', 'event_offset_seconds': .35})
        self.assertAlmostEqual(spec['centers'][0], .154-.35)
        self.assertEqual(spec['event_offset_seconds'], .35)

    def test_custom_files_keep_their_offset_including_zero(self):
        for offset in [0, .2, 1.2]:
            spec = self.spec(eventOffset=offset)
            self.assertEqual(spec['event_offset_seconds'], offset)
            self.assertAlmostEqual(spec['centers'][0], .154-offset)
            self.assertAlmostEqual(spec['centers'][-1], .874-offset)

    def test_invalid_event_onset_is_rejected(self):
        for offset in [float('nan'), float('inf')]:
            with self.assertRaisesRegex(ValueError, 'finite event onset'):
                self.spec({'recording': 'Timing', 'event_offset_seconds': offset})


result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(EventTimingTests))
if not result.wasSuccessful():
    raise AssertionError('Event timing checks failed.')
