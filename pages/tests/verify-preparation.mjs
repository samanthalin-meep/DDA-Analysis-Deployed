import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { loadPyodide } from "../public/runtime/pyodide.mjs";
const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "..");
const output = resolve(
  process.argv[2] || resolve(tmpdir(), "ddalab-browser-preparation-proof"),
);
await mkdir(output, { recursive: true });
const py = await loadPyodide({
  indexURL: resolve(root, "public/runtime") + "/",
});
await py.loadPackage(["numpy", "scipy"]);
py.FS.mkdirTree("/app");
py.FS.mkdirTree("/input");
for (const name of ["preparation.py", "workspace.py"])
  py.FS.writeFile(
    "/app/" + name,
    await readFile(resolve(root, "python", name)),
  );
const files = [
  ["Sample_I1_R3.edf", "recording.edf"],
  ["Sample_I1_R3_Log.txt", "log.txt"],
  ["Sample_I1_R3_Conditions.csv", "conditions.csv"],
];
for (const [name, target] of files)
  py.FS.writeFile(
    "/input/" + target,
    await readFile(resolve(repo, "Sample_I1_R3_data", name)),
  );
py.runPython('import sys\nsys.path.insert(0,"/app")\nimport workspace');
const api = py.pyimport("workspace");
const cfg = {
  electrodes: ["E1", "E17", "E129"],
  conditions: ["control", "exp1", "exp2", "exp3", "exp4", "exp5"],
  average: true,
  recording: "WasmProof",
};
const start = Date.now();
const metadata = JSON.parse(
  api.prepare_files(
    JSON.stringify(cfg),
    await readFile(resolve(root, "public/coordinates.json"), "utf8"),
    (label, n, total) =>
      console.log(Math.round((Date.now() - start) / 1000), label, n, total),
  ),
);
assert.equal(metadata.length, 1);
assert.deepEqual(metadata[0].electrodes, cfg.electrodes);
assert.equal(metadata[0].preparation.recording, cfg.recording);
// Reconstruct the three original per-electrode exports from the retained signals.
// This checks the default averaging path without a second expensive preparation.
py.globals.set("prepared_id", metadata[0].id);
const individual = JSON.parse(py.runPython(`
d = workspace.datasets[prepared_id]
original_exports = []
for electrode, matrix in zip(d['electrodes'], d['electrode_data']):
    columns = [electrode+'__'+name.split('__',1)[1] for name in d['columns']]
    original_exports.append(workspace.register('DDA_WasmProof_'+electrode+'.csv', matrix, d['time'], columns))
workspace.json.dumps(original_exports)
`));
metadata.push(...individual);
for (const d of metadata)
  await writeFile(resolve(output, d.name), api.export_dataset(d.id));
const stored = JSON.parse(api.export_electrodes(metadata[0].id));
const restored = JSON.parse(api.open_csv(metadata[0].name, api.export_dataset(metadata[0].id), 250,
  JSON.stringify({ preparation: metadata[0].preparation, electrode_data: stored })));
const viewConfig = JSON.stringify({ indices: [0, 144], electrodes: ["E1", "E129"], mode: "mean" });
assert.equal(api.preview(restored.id, viewConfig), api.preview(metadata[0].id, viewConfig));
assert.deepEqual(
  metadata[0].counts.map((r) => r.exported_trials),
  [145, 28, 27, 30, 24, 29, 0, 0],
);
assert.deepEqual(metadata[0].preparation.bad_channels, [
  "E17",
  "E20",
  "E25",
  "E32",
  "E43",
  "E44",
  "E48",
  "E87",
  "E104",
  "E112",
  "E119",
]);
const sha = createHash("sha256")
  .update(await readFile(resolve(output, "DDA_WasmProof_E1.csv")))
  .digest("hex");
assert.equal(
  sha,
  "007778d72ae03021c097a6eef1556d9651d2bb3b416fdb189c074a8652076cc3",
);
await writeFile(
  resolve(output, "metadata.json"),
  JSON.stringify(metadata, null, 2),
);
console.log(
  "FINISHED",
  metadata.map((d) => ({
    name: d.name,
    rows: d.rows,
    trials: d.columns.length,
    prep: d.preparation,
  })),
);
