# Desktop source

`vendor/ddalab_qt`, `vendor/ddalab_gui`, and `vendor/pyproject.original.toml` are copied from the supplied DDALAB Pooled 1.2.10 source at:

`102226/DDA_CrossTrials_I1_R3/03_execution_record/gui_app_build/DDALAB_Pooled_source/packages/ddalab/`

The Python application source is unchanged. The copied macOS backend executable is omitted from the web package. `DDALAB_CLI_PATH` selects the Linux executable built from the preserved Rust source in `../runner/dda-rs/`, with its existing MIT license.

The browser adapter adds file upload/download dialogs, a private saved session, and the Upload recording action. It runs the original Qt application with `server_url=None`. It does not replace its analysis panels or compute methods.

`ste_copy.py` removes explanatory prose and shortens operating instructions. It follows [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf) principles: short commands, one instruction per sentence, consistent control names, and technical terminology. This is a text review, not a claim of certified compliance with the complete standard.

Technical nouns and control names include DDALAB, DDA, CT, ICA, MODEL, pooled trials, electrode, epoch, event onset, coefficient, a1, EDF, TXT, CSV, BIDS, BrainVision, FIF, EEGLAB, XDF, NWB, NIfTI, JSON, PNG, SVG, PDF, MATLAB, Python, Julia, Rust, and .ddalab.

The browser transport uses the official noVNC v1.6.0 source, pinned by URL and lockfile integrity. Its MPL-2.0 license and notices remain in the generated `novnc` directory. PySide6/Qt and scientific libraries retain their upstream licenses in the installed environment.

The supplied `.ttf` assets contain saved HTML pages, as they do in the original macOS app. Qt uses its original Helvetica Neue fallback. Browser dialogs use the same font stack. IBM's font license is retained in `IBM-Plex-LICENSE.txt` for reference.
