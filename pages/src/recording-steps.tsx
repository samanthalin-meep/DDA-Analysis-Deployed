import React from "react";
import type { Dataset } from "./types";

export type AnalysisStep = "settings" | "results";

export function RecordingSteps({
  dataset,
  step,
  busy,
  hasResult,
  onPrepare,
  onSettings,
  onResults,
}: {
  dataset: Dataset;
  step: AnalysisStep;
  busy: boolean;
  hasResult: boolean;
  onPrepare: () => void;
  onSettings: () => void;
  onResults: () => void;
}) {
  return (
    <section className="recording-steps" aria-label="Recording workflow">
      <nav aria-label="Recording steps">
        <ol>
          <li>
            <button disabled={busy} onClick={onPrepare}>
              <span className="step-number" aria-hidden="true">
                ✓
              </span>
              Prepare
            </button>
          </li>
          <li>
            <button
              disabled={busy}
              aria-current={step === "settings" ? "step" : undefined}
              onClick={onSettings}
            >
              <span className="step-number" aria-hidden="true">
                2
              </span>
              Trials and settings
            </button>
          </li>
          <li>
            <button
              disabled={busy || !hasResult}
              aria-current={step === "results" ? "step" : undefined}
              onClick={onResults}
            >
              <span className="step-number" aria-hidden="true">
                3
              </span>
              Results
            </button>
          </li>
        </ol>
      </nav>
      <p className="recording-summary">
        {dataset.columns.length} trials · {dataset.groups.length} conditions ·{" "}
        {Number(dataset.rate.toFixed(6))} Hz
      </p>
    </section>
  );
}
