import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

async function sourceModule(path) {
  const { code } = await transform(
    await readFile(new URL(path, import.meta.url), "utf8"),
    { loader: "ts", format: "esm", target: "es2022" },
  );
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const { signalLabel, trialLabel, electrodeLabel, averageMembers, fitLabel } =
  await sourceModule("../src/signal-labels.ts");
const { makeSession } = await sourceModule("../src/session.ts");
const { exportName } = await sourceModule("../src/export-names.ts");
assert.equal(exportName("DDA_I1_R4.csv", "graph"), "I1_R4_graph");
assert.equal(exportName("I1_R4_prepared_E1.csv", "graph"), "I1_R4_graph");
assert.equal(exportName("DDA_Test_E1.csv", "prepared.csv", "Test"), "Test_prepared.csv");
assert.equal(exportName("/folder/new subject.csv", "results.csv"), "new subject_results.csv");
assert.equal(exportName("old.csv", "graph", "ID_02"), "ID_02_graph");
assert.equal(exportName("DDA_Old.csv", "graph", "Other_Recording"), "Other_Recording_graph");
assert.equal(exportName("file.csv", "../graph", "a:b"), "a_b_.._graph");
const members = Array.from({ length: 129 }, (_, i) => `E${i + 1}`);
const average = "AVG_" + members.join("_");
const columns = ["control", "exp1", "exp2", "exp3", "exp4", "exp5"].flatMap(
  (condition) => [9, 60, 380].map(
    (event) => `${average}__${condition}__trial_event${String(event).padStart(6, "0")}`,
  ),
);
const labels = columns.map(signalLabel);
assert.equal(new Set(labels).size, columns.length, "Every condition/event must remain distinct.");
assert.equal(labels[1], "control · Event 60");
assert(labels.every((label) => label.length <= 20 && !label.includes("AVG_")));
assert.equal(electrodeLabel(average), "Average (E1–E129)");
assert.deepEqual(averageMembers(average), members);
assert.deepEqual(trialLabel(columns[1]), {
  electrode: average, condition: "control", trial: "Event 60",
});
assert.equal(signalLabel("E17__exp4__trial_00012"), "exp4 · Trial 12");
assert.equal(signalLabel("E17__exp4__trial_event000000000000000000123"), "exp4 · Event 123");
assert.equal(signalLabel("Fp1"), "Fp1");
assert.equal(signalLabel(undefined), "");
assert.equal(signalLabel(`Pooled cross-trial CT - ${average} - a1`), "Pooled cross-trial CT - Average (E1–E129) - a1");
assert.equal(electrodeLabel("AVG_E9_E1_E2_E3_E8"), "Average (E1–E3, E8–E9)");
assert.deepEqual(averageMembers("AVG_E9_E1_E2_E3_E8"), ["E9", "E1", "E2", "E3", "E8"]);
const sparse = "AVG_" + members.filter((_, i) => i % 2 === 0).join("_");
assert.equal(electrodeLabel(sparse), "Average (65 electrodes)");
assert.equal(averageMembers(sparse).length, 65);
assert.equal(fitLabel(labels[1], 20), labels[1]);
assert.equal(fitLabel("Long generic channel ending 123", 15).slice(-3), "123");
assert.equal(fitLabel("Long name", 1), "…");

const config = { indices: [1, 4], variants: ["CT"], delays: [7, 10], terms: [1, 2, 10] };
const dataset = { id: "test", name: "DDA_Test.csv", columns };
const source = { name: dataset.name, text: "time," + columns.join(",") + "\n", meta: {
  preparation: { recording: "Test", bad_channels: [] },
  electrode_data: { encoding: "f32le-base64", electrodes: members, values: "AAAAAA==" },
} };
const snapshot = makeSession([dataset], dataset, config, undefined, [source], [], false);
assert.deepEqual(snapshot.selectedChannelNames, [columns[1], columns[4]]);
assert.deepEqual(snapshot.ddaConfig.variantChannelNames.CT, [columns[1], columns[4]]);
assert.equal(snapshot.browser.files[0].text, source.text);
assert.equal(snapshot.browser.config.indices, config.indices);
assert.deepEqual(JSON.parse(JSON.stringify(snapshot)).browser.files[0].meta, source.meta);
console.log("PASS: compact trial/average labels stay distinct; full electrode membership and session/export identifiers are preserved.");
