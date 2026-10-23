import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import init, { run_dda } from "../public/engine/dda.js";
await init({
  module_or_path: await readFile(
    new URL("../public/engine/dda_bg.wasm", import.meta.url),
  ),
});
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/ct-reference.json", import.meta.url)),
);
const matrix = Float64Array.from(fixture.matrix.flat());
const labels = Array.from({ length: 6 }, (_, i) => `Channel ${i + 1}`);
const request = {
  file_path: "independent-fixture.csv",
  channels: null,
  time_range: { start: 0, end: 399 },
  preprocessing_options: { highpass: null, lowpass: null },
  algorithm_selection: { enabled_variants: ["CT"] },
  window_parameters: {
    window_length: 50,
    window_step: 10,
    ct_window_length: 6,
    ct_window_step: 6,
  },
  delay_parameters: { delays: [7, 10] },
  model_parameters: { dm: 4, order: 4, nr_tau: 2 },
  model_terms: [1, 2, 10],
  sampling_rate: 250,
};
let progress = 0;
const run = (req) =>
  JSON.parse(
    run_dda(JSON.stringify(req), matrix, 400, 6, JSON.stringify(labels), () => {
      progress++;
    }),
  );
const pooled = run(request).variant_results[0].q_matrix[0];
assert.equal(pooled.length, fixture.a1.length);
const delta = Math.max(...pooled.map((v, i) => Math.abs(v - fixture.a1[i])));
assert.ok(delta < 2e-12, `Independent pooled CT difference: ${delta}`);
assert.ok(progress > 0, "The browser progress callback must run.");
for (const variant of [
  "ST",
  "SY",
  "DE",
  "CT",
  "CD",
  "CCD",
  "CCDSIG",
  "CCDSTAB",
  "TRCCD",
  "MVCCD",
]) {
  const r = run({
    ...request,
    algorithm_selection: { enabled_variants: [variant] },
    window_parameters: {
      ...request.window_parameters,
      ct_window_length: 2,
      ct_window_step: 1,
    },
  });
  const v = r.variant_results.find((v) => v.variant_id === variant);
  assert.ok(v, `${variant} must return its named result.`);
  assert.ok(
    v.q_matrix.length > 0 && v.q_matrix.flat().every(Number.isFinite),
    `${variant} must return finite values.`,
  );
}
assert.throws(() =>
  run_dda(
    JSON.stringify(request),
    new Float64Array(1),
    400,
    6,
    JSON.stringify(labels),
    () => {},
  ),
);
console.log(
  JSON.stringify({
    passed: true,
    independentCTMaxDifference: delta,
    windows: pooled.length,
    variants: 10,
    progressCallbacks: progress,
  }),
);
