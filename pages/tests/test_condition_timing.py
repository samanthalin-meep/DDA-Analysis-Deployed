"""Conditions-table compatibility and exact log/EDF pulse alignment checks."""
import csv
import io
from pathlib import Path
import tempfile
import unittest

import numpy as np
from preparation import read_condition_rows, read_events, read_edf, trial_samples


EVENTS = [(0.215, 0.200, 'STRT'), (1.317, 1.300, 'stim'),
          (3.650, 2.450, 'stim'), (5.100, 3.900, 'net')]
LABELS = ['start', 'control', 'exp1']


def clock(seconds, digits):
    ticks = round(seconds * 10**digits)
    whole, fraction = divmod(ticks, 10**digits)
    hours, remainder = divmod(whole, 3600)
    minutes, second = divmod(remainder, 60)
    if digits == 6:
        return f'{hours:02}:{minutes:02}:{second:02}.{fraction//1000:03}.{fraction%1000:03}'
    return f'{hours:02}:{minutes:02}:{second:02}.{fraction:03}'


def log(events=EVENTS):
    return '\n'.join([
        'Sampling Rate: 1000 s/s',
        *(f'{clock(message, 6)}: Event: {clock(payload, 3)}, {code}, test'
          for message, payload, code in events),
        'Recording duration 4.2, record duration 4.2',
    ])


def table(header, rows):
    text = io.StringIO()
    writer = csv.writer(text)
    writer.writerow(header)
    writer.writerows(rows)
    return text.getvalue()


def duration_table():
    return table(['stimIte1', 'Duration', 'Intertrial Interval', 'Condition'], [
        ['trigger', '.4', '.7', 'start'],
        ['stimuli/mi.wav', '.45', '.7', 'control'],
        ['stimuli/ma.wav', '.333', '.7', 'exp1'],
    ])


def seconds_table():
    return table(['sec_time', 'label'], [(event[0], label) for event, label in zip(EVENTS, LABELS)])


def edf(path, pulses):
    channels, records, samples = 130, 5, 1000
    fields = [
        (16, [f'E{i}' for i in range(1, 130)] + ['Status']),
        (80, ['']*channels), (8, ['uV']*channels),
        (8, ['-32768']*channels), (8, ['32767']*channels),
        (8, ['-32768']*channels), (8, ['32767']*channels),
        (80, ['']*channels), (8, ['1000']*channels), (32, ['']*channels),
    ]
    header = bytearray(b' '*256)
    for start, width, value in [(0, 8, '0'), (184, 8, str(256+256*channels)),
                                (236, 8, str(records)), (244, 8, '1'), (252, 4, str(channels))]:
        header[start:start+width] = value.encode().ljust(width)
    for width, values in fields:
        header.extend(b''.join(value.encode().ljust(width) for value in values))
    data = np.zeros((channels, records*samples), dtype='<i2')
    data[-1] = -1
    for index in pulses:
        data[-1, index-1] = 0
    path.write_bytes(header + data.reshape(channels, records, samples).transpose(1, 0, 2).tobytes())


class ConditionTiming(unittest.TestCase):
    def test_both_formats_use_the_same_recorded_events(self):
        seconds = read_events(log(), seconds_table())
        durations = read_events(log(), duration_table())
        self.assertEqual(durations, seconds)
        trials, labels, length, physical = durations
        self.assertEqual(trials, EVENTS[:3])
        self.assertEqual(labels, LABELS)
        self.assertEqual(length, 4.2)
        self.assertEqual(physical, EVENTS)

    def test_seconds_timestamps_still_require_an_exact_match(self):
        for changed in [seconds_table().replace('1.317,control', '1.319,control'),
                        seconds_table().replace('0.215,start', '0.216,start')]:
            with self.subTest(csv=changed), self.assertRaisesRegex(ValueError, 'CSV times do not match'):
                read_events(log(), changed)

    def test_duration_schedule_mismatch_is_rejected(self):
        changed = duration_table().replace('stimuli/mi.wav,.45,.7,control', 'stimuli/mi.wav,2,.7,control')
        with self.assertRaisesRegex(ValueError, 'duration table does not match the TXT timing'):
            read_events(log(), changed)

    def test_start_marker_wait_does_not_override_recorded_onsets(self):
        changed = duration_table().replace('trigger,.4,.7,start', 'trigger,1,17,start')
        self.assertEqual(read_events(log(), changed), read_events(log(), seconds_table()))
        # Only the initial marker gets this exception. Stimulus intervals keep
        # the same 100 ms limit, including after a different startup pause.
        invalid = changed.replace('stimuli/mi.wav,.45,.7,control', 'stimuli/mi.wav,.6,.7,control')
        with self.assertRaisesRegex(ValueError, 'CSV row 3'):
            read_events(log(), invalid)

    def test_event_counts_and_trigger_labels_are_checked(self):
        for changed in [duration_table().replace('stimuli/ma.wav,.333,.7,exp1\r\n', ''),
                        duration_table().replace(',start', ',control')]:
            with self.subTest(csv=changed), self.assertRaises(ValueError):
                read_events(log(), changed)

    def test_invalid_values_and_conflicting_columns_are_rejected(self):
        for value in ['', '-1', 'NaN', 'Infinity', '0x10']:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'nonnegative seconds'):
                read_condition_rows(table(['Duration', 'Intertrial Interval', 'Condition'], [[value, '.7', 'exp1']]))
        with self.assertRaisesRegex(ValueError, 'condition columns differ'):
            read_condition_rows('Duration,Intertrial Interval,label,Condition\n.333,.7,exp1,exp2')
        with self.assertRaisesRegex(ValueError, 'repeated columns'):
            read_condition_rows('Duration,duration,Intertrial Interval,Condition\n.3,.3,.7,exp1')

    def test_system_marker_pulse_is_checked_but_does_not_become_a_trial(self):
        trials, _, length, physical = read_events(log(), duration_table())
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'test.edf'
            edf(path, [200, 1300, 2450, 3900])
            samples, indices = read_edf(path, length, trials, physical_events=physical)
            self.assertEqual(samples.shape, (129, 4200))
            np.testing.assert_array_equal(indices, [200, 1300, 2450])
            for pulses in [[200, 1300, 2450], [200, 1301, 2450, 3900], [200, 1300, 2450, 3900, 4000]]:
                edf(path, pulses)
                with self.subTest(pulses=pulses), self.assertRaisesRegex(ValueError, 'Status pulses do not match'):
                    read_edf(path, length, trials, physical_events=physical)

    def test_zero_based_export_requires_one_exact_offset_for_every_marker(self):
        trials, _, length, physical = read_events(log(), duration_table())
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'zero-based.edf'
            edf(path, [201, 1301, 2451, 3901])
            _, indices = read_edf(path, length, trials, physical_events=physical)
            np.testing.assert_array_equal(indices, [201, 1301, 2451])
            for pulses in [[202, 1302, 2452, 3902], [201, 1301, 2450, 3901], [201, 1301, 2451]]:
                edf(path, pulses)
                with self.subTest(pulses=pulses), self.assertRaisesRegex(ValueError, 'Status pulses do not match'):
                    read_edf(path, length, trials, physical_events=physical)

    def test_missing_and_ambiguous_markers_are_rejected(self):
        trials, _, _, physical = read_events(log(), duration_table())
        with self.assertRaisesRegex(ValueError, 'Status channel has no event markers'):
            trial_samples(np.zeros(4200), trials, physical)
        # Two equally valid conventions must not silently choose one.
        with self.assertRaisesRegex(ValueError, 'Status pulses do not match'):
            trial_samples(np.array([1,0,1,0]), [(0,.001,'STRT'), (0,.003,'stim')])


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ConditionTiming)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise AssertionError('Conditions-table timing checks failed.')
