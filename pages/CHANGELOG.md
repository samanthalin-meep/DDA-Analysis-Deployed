# Change log

## 2026-10-24 — I3 conditions and event alignment

- **Initial wait:** Duration tables no longer require the initial `start` row's planned wait to match the acquisition startup gap. I3_R2 and I3_R3 specify 18 seconds, but their logs record 6.020 and 6.021 seconds. Later stimulus intervals retain the 100 ms check. Timestamp CSV files retain the exact message-time check, including the start row.
- **EDF sample indexing:** Accept either existing one-based sample latencies or zero-based export times only when every physical Status marker proves one shared, exact mapping. Use the actual EDF marker positions for epoching. Missing markers, extra markers, isolated shifts, shifts beyond one sample, and ambiguous mappings still fail. Save the verified convention as `preparation.event_sample_offset` in session/result metadata.
- **Missing markers:** Report a specific error when the EDF Status channel contains no event markers. Do not infer missing markers from CSV durations.
- **Local I3_R2 repair:** Created `I3_R2_fixed` beside the original input folder. Restored its 380 Status markers from the original acquisition EDF's STRT/stim tracks, confirmed against the acquisition XML and TXT. Preserved the supplied EEG samples and EDF header exactly. Copied the TXT and CSV without changes. Kept all original input files. The folder contains `CHANGE_NOTE.md` with the repair details.

Validation: I3_R2 has 380 matching physical markers after repair; I3_R3 already has 382. Both exports use zero-based times. Subsequent schedule differences are at most 33 ms and 36 ms, respectively. Both CSV formats resolve to the same logged events and measured EDF sample positions. Original reference/filter/interpolation/resampling/artifact and DDA calculations are unchanged.

Full preparation in the pinned WebAssembly Python runtime, using all 129 electrodes and all six analysis conditions:

| Recording | Input epochs | Retained analysis trials |
| --- | ---: | ---: |
| I3_R2, repaired Status channel | 380 | 327 |
| I3_R3, original input files | 382 | 223 |

Both runs produced finite waveforms and valid pooled CT inputs across six conditions and 19 windows. Saved individual signals and CSV files passed a restore round trip. The original I1_R3 reference test still retains 283 trials, and its complete E1 CSV remains byte-identical to the reference output.
