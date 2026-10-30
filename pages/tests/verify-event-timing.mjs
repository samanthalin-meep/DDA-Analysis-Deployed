import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { loadPyodide } from "../public/runtime/pyodide.mjs";

async function sourceModule(path) {
  const { code } = await transform(await readFile(new URL(path, import.meta.url), "utf8"),
    { loader: "ts", format: "esm", target: "es2022" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const { defaultConfig } = await sourceModule("../src/types.ts");
const { configForPreparedData, correctPreparedResultTiming } = await sourceModule("../src/timing.ts");
const { makeSession } = await sourceModule("../src/session.ts");
assert.equal(defaultConfig.eventOffset, 0.2);
const preparation = { recording: "Timing", bad_channels: [], epochs: 2, global_sd: 1, rejected_events: [] };
const config = { ...defaultConfig, eventOffset: 1.2, indices: [0, 1] };
assert.equal(configForPreparedData(config, preparation).eventOffset, 0.2);
assert.equal(configForPreparedData(config, { ...preparation, event_offset_seconds: 0.35 }).eventOffset, 0.35);
assert.strictEqual(configForPreparedData(config), config, "Custom data keeps its chosen offset.");
for (const offset of [0, 0.35, 1.2]) {
  const manual = { ...config, eventOffset: offset, eventOffsetManual: true };
  assert.strictEqual(configForPreparedData(manual, preparation), manual,
    "An entered onset takes precedence over preparation metadata.");
}
const original = {
  id: "old-result", file_name: "DDA_Timing.csv", created_at: "2026-10-29T00:00:00Z",
  config, preparation, engine: "Original dda-rs",
  window_centers_seconds: Array.from({ length: 19 }, (_, k) => 0.154 + k * 0.04 - 1.2),
  variants: [{ id: "CT", label: "Pooled CT", matrix: [Array.from({ length: 19 }, (_, k) => k / 10 - 1)], row_labels: ["control"] }],
  trial_groups: [{ electrode: "E1", condition: "control", indices: [0, 1] }],
};
const untouched = JSON.stringify(original);
const corrected = correctPreparedResultTiming(original);
assert(Math.abs(corrected.window_centers_seconds[0] + 0.046) < 1e-12);
assert(Math.abs(corrected.window_centers_seconds.at(-1) - 0.674) < 1e-12);
assert.equal(corrected.config.eventOffset, 0.2);
assert.strictEqual(corrected.variants, original.variants, "No coefficients are recalculated or changed.");
assert.equal(JSON.stringify(original), untouched, "Keep the original result object intact.");
assert.deepEqual(corrected.timing_correction, {
  original_event_offset_seconds: 1.2, corrected_event_offset_seconds: 0.2,
});
assert.strictEqual(correctPreparedResultTiming(corrected), corrected, "A result is shifted only once.");
const withBounds = correctPreparedResultTiming({ ...original, epoch_time_bounds_seconds: [-1.2, -0.2] });
assert(Math.abs(withBounds.epoch_time_bounds_seconds[0] + 0.2) < 1e-12);
assert(Math.abs(withBounds.epoch_time_bounds_seconds[1] - 0.8) < 1e-12);
for (const offset of [0, 0.2, 0.35]) {
  const custom = { ...original, config: { ...config, eventOffset: offset } };
  assert.strictEqual(correctPreparedResultTiming(custom), custom, "Other saved offsets are preserved.");
}
const unknown = { ...original, preparation: undefined };
assert.strictEqual(correctPreparedResultTiming(unknown), unknown, "Do not infer timing from a negative axis alone.");
assert.equal(correctPreparedResultTiming(unknown, preparation).config.eventOffset, 0.2);
const differentRecipe = { ...original, preparation: { ...preparation, event_offset_seconds: 1.2 } };
assert.strictEqual(correctPreparedResultTiming(differentRecipe), differentRecipe);
const manualResult = { ...original, config: { ...config, eventOffsetManual: true } };
assert.strictEqual(correctPreparedResultTiming(manualResult), manualResult,
  "An intentional 1.2 s onset must never be migrated back to 0.2 s.");
const columns = ["E1__control__trial_event000001", "E1__control__trial_event000002"];
const dataset = { id: "timing", name: original.file_name, columns, preparation };
const snapshot = JSON.parse(JSON.stringify(makeSession([dataset], dataset,
  configForPreparedData(config, preparation), corrected, [], [], false)));
assert.equal(snapshot.ddaResult.reproduction.event_offset_seconds, 0.2);
assert.equal(snapshot.ddaConfig.eventOffsetSeconds, 0.2);
assert.deepEqual(snapshot.browser.result.variants, original.variants);
assert.deepEqual(snapshot.browser.result.timing_correction, corrected.timing_correction);
assert.strictEqual(correctPreparedResultTiming(snapshot.browser.result), snapshot.browser.result);
const manualSnapshot = JSON.parse(JSON.stringify(makeSession([dataset], dataset,
  manualResult.config, manualResult, [], [], false)));
assert.equal(manualSnapshot.ddaConfig.eventOffsetSeconds, 1.2);
assert.equal(manualSnapshot.ddaConfig.eventOffsetManual, true);
assert.equal(manualSnapshot.ddaResult.reproduction.event_offset_seconds, 1.2);
assert.equal(manualSnapshot.ddaResult.reproduction.event_offset_manual, true);
assert.equal(manualSnapshot.browser.config.eventOffsetManual, true);
assert.strictEqual(correctPreparedResultTiming(manualSnapshot.browser.result), manualSnapshot.browser.result);
console.log("PASS: defaults, prepared-file settings, legacy results, and session round trips preserve coefficients and correct timing once.");

const py = await loadPyodide({ indexURL: fileURLToPath(new URL("../public/runtime/", import.meta.url)) });
await py.loadPackage(["numpy", "scipy"]);
for (const name of ["preparation.py", "workspace.py"])
  py.FS.writeFile("/" + name, await readFile(new URL("../python/" + name, import.meta.url), "utf8"));
py.runPython('import sys\nsys.path.insert(0, "/")');
try {
  py.runPython(await readFile(new URL("./test_event_timing.py", import.meta.url), "utf8"));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
