"""Short interface text. Scientific names and control names stay consistent."""

# The desktop source remains intact. This adapter replaces nonessential prose.
COPY = {
    'Connect to the backend and open a dataset to begin.': 'Open a file.',
    'No dataset open': 'No file open',
    'Loading dataset metadata…': 'Read file data.',
    'Open a dataset to configure channels.': 'Open a file.',
    'Tune how DDALAB behaves on this machine': 'Settings',
    'Workspace Preferences': '',
    'Choose your backend mode, switch themes, and decide whether the interface should stay streamlined or expose expert DDA controls.': '',
    'Current feel': 'Theme',
    'Default on-device mode': '',
    'Use Visualize for waveform inspection, DDA for analysis, and Collaborate for snapshots and workflow exports.': '',
    'The Qt client keeps the same top-level DDALAB structure while using a Python-native desktop backend for analysis and OpenNeuro browsing.': '',
    'Standard EEG preset active': 'EEG Standard',
    'Standard mode matches the archived DDALAB EEG preset: delays [7, 10], MODEL terms [1, 2, 10], dm=4, order=4, nr_tau=2.': '',
    'No saved analyses for this file yet.': 'No saved analysis.',
    'Run DDA to create or export a portable .ddalab file.': 'Select Run DDA.',
    'Dataset notes will appear here.': '',
    'Open a dataset to control replay.': 'Open a file.',
    'Select files to start batch analysis.': 'Select files.',
    'No channels selected for CT.': 'Select trials.',
    'No files': 'No file open',
    'Select all trials': 'Select all trials',
    'Clear selection': 'Clear selection',
    'Enable advanced DDA controls': 'Advanced DDA controls',
    'Event onset from file start (s)': 'Event onset (s)',
    'Local Python backend active.\nThis is the default and recommended mode for running DDALAB on your own device.': 'Local backend',
    'Open a dataset to start annotating the current view.': 'Open a file.',
    'Select a variant above to configure its channels or pairs.': 'Select a variant.',
    'Turn on at least one DDA variant to configure its dedicated selector.': 'Select a DDA variant.',
    'Select the polynomial terms that should be sent to the DDA backend.': 'Select MODEL terms.',
    'ICA uses the channels currently selected in Visualize. Select at least two channels before running.': 'In Visualize, select at least two channels.',
    'Select a component to inspect the preview metrics.': 'Select a component.',
    'Select multiple datasets and reuse the current DDA configuration across them.': 'Select files.',
    'Run DDA with CT, CD, or SY to inspect connectivity metrics.': 'Run CT, CD, or SY.',
    'Run DDA with CD to inspect directed causality motifs.': 'Run CD.',
    'Select two analyses to inspect their shared variants and rows.': 'Select two analyses.',
    'Choose the shared rows to use in heatmaps, lines, and statistics.': 'Select rows.',
    'Select two analyses to compare their shared variants, rows, and trends.': 'Select two analyses.',
    'Select a dataset to inspect the details.': 'Select a dataset.',
    'Run DDA or import a portable .ddalab file.': 'Select Run DDA.',
    'Current file state, DDA output, and portable .ddalab exports.': 'Results',
    'Diagnostics and execution details': 'Diagnostics',
    'ICA diagnostics and execution details': 'ICA diagnostics',
    'Batch run details will appear here.': 'Batch results',
    'Row-level statistics will appear here when two analyses share a variant.': 'Row statistics',
    'Result details, exports, and snapshot metadata appear here.': 'Result details',
    'Save the plotted values. Pooled CT includes time_relative_event_s and a1.': 'Export graph data.',
    'Pooled CT only: event position in seconds from the first input row. Subtracted from fitted-sample centers; does not move or change the data.': 'Time from the first file sample to the event. This value changes the time axis only.',
    'Optional remote server URL for shared or institutional deployments': 'Remote server URL',
    'Leave this empty to keep using the bundled local backend.': 'For the local backend, leave the URL empty.',
    'Remote mode is active. Clear the URL or use the local button to return to the bundled backend.': 'To use the local backend, select Use Local Backend.',
    'Local Python backend is the default backend.': 'Local Python backend',
    'Loading dataset metadata and restoring saved results…': 'File data',
    'Loading saved analyses…': 'Saved analyses',
    'Loading saved batch/result history…': 'Saved results',
    'Loading saved DDA result…': 'Saved DDA result',
    'Loading saved ICA result…': 'Saved ICA result',
    'Restoring batch/result history after startup…': 'Saved results',
    'Restoring the last saved DDA result after startup…': 'Saved DDA result',
    'Restoring the last saved ICA result after startup…': 'Saved ICA result',
    'Restoring connectivity views after startup…': 'Connectivity',
    'Restoring network motif plots after startup…': 'Network motifs',
    'Restoring comparison views after startup…': 'Comparison',
    'BIDS roots, EDF/BDF, BrainVision, FIF/EEGLAB, XDF, NWB, and NIfTI datasets can be opened from the browser or the file/folder picker.': 'BIDS, EDF/BDF, BrainVision, FIF/EEGLAB, XDF, NWB, NIfTI',
}

for text in (
    'Show or hide the file browser',
    'Replay advances the loaded viewport through the active dataset using the current waveform controls. Use it to inspect longer recordings as a continuous stream.',
    'Standard mode uses the archived DDALAB EEG defaults for delays and MODEL selection.',
    'Open a portable DDALAB file (.ddalab).',
    'Save the current dataset state and result to a portable DDALAB file.',
    'Export recipe-only .ddalab files, JSON/CSV data, scripts, plots, and annotations.',
    'Export recipe-only .ddalab files, JSON/CSV data, scripts, and plots.',
    'Local mode is recommended for everyday use. Remote mode is available for shared or institutional deployments.',
    'Switch between the darker analysis workspace and a lighter review mode without restarting the app.',
    'Dark mode keeps focus on plots and long sessions.',
    'Dark mode keeps attention on plots during longer analysis sessions.',
    'Light mode works well for screenshots, daytime review, and side-by-side reading.',
    'Choose whether DDALAB should stay streamlined or expose the full expert DDA parameter space.',
    'Expert mode exposes custom delays, MODEL dimensions, polynomial order, and explicit term selection. When disabled, DDALAB runs with the archived EEG defaults.',
    'Connected to a shared backend', 'Bundled backend on this device',
    'Brighter review and presentation mode', 'Focused analysis workspace',
    'Custom DDA controls are available', 'Archived EEG defaults stay in control',
    'Archived EEG defaults',
    'Installed desktop builds can check GitHub Releases, download the correct asset for this platform, and hand off installation automatically.',
    'Check GitHub releases for packaged desktop updates.',
    'Automatic checks run only for installed desktop builds.',
    'Packaged desktop builds check GitHub Releases and install the matching asset for this platform.',
    'DDALAB Pooled is a local research build. Automatic upstream updates are disabled to preserve pooled mode.',
    'Use a release installer or frozen app build to enable update checks and one-click installs.',
    'This desktop build focuses on active local workflows and keeps unsupported integrations hidden from the main navigation.',
    'Included in this build', 'Waveform inspection and viewport navigation',
    'DDA, ICA, batch analysis, connectivity, and compare views',
    'Annotations, portable .ddalab snapshots, and reproducible exports',
    'Workflow recording, notifications, and OpenNeuro browsing',
):
    COPY[text] = ''


def apply_copy(window):
    from PySide6.QtWidgets import (QWidget, QLabel, QAbstractButton, QGroupBox,
                                   QLineEdit, QPlainTextEdit, QTextEdit)
    for widget in window.findChildren(QWidget):
        tooltip = widget.toolTip()
        if tooltip in COPY:
            widget.setToolTip(COPY[tooltip])
        if isinstance(widget, (QLineEdit, QPlainTextEdit, QTextEdit)):
            placeholder = widget.placeholderText()
            if placeholder in COPY:
                widget.setPlaceholderText(COPY[placeholder])
        if isinstance(widget, QGroupBox):
            if widget.title() in COPY:
                widget.setTitle(COPY[widget.title()])
        elif isinstance(widget, (QLabel, QAbstractButton)):
            text = widget.text()
            if isinstance(widget, QLabel) and text == 'Desktop Scope':
                widget.parentWidget().hide()
                continue
            if text in COPY:
                replacement = COPY[text]
                if replacement:
                    widget.setText(replacement)
                    if widget.property('ddaCopyHidden'):
                        widget.show()
                        widget.setProperty('ddaCopyHidden', False)
                elif isinstance(widget, QLabel):
                    widget.hide()
                    widget.setProperty('ddaCopyHidden', True)
            elif text.startswith('Loading saved analyses for ') and text.endswith('…'):
                widget.setText('Saved analyses: ' + text[26:-1])
            elif widget.property('ddaCopyHidden') and text.strip():
                widget.show()
                widget.setProperty('ddaCopyHidden', False)
        elif isinstance(widget, (QPlainTextEdit, QTextEdit)) and widget.isReadOnly():
            text = widget.toPlainText()
            if text in COPY:
                widget.setPlainText(COPY[text])
    # Runtime and platform paths do not help operate the program in a browser.
    window.backend_status_label.hide()
    window.file_status_label.hide()
