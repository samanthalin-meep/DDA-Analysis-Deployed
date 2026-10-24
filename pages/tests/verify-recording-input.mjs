import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const { code } = await transform(
  await readFile(new URL("../src/recording-input.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "esm", target: "es2022" },
);
const { readElectrodes, readConditions } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

function edfHeader(labels) {
  const header = new Uint8Array(256 + 256 * labels.length).fill(32);
  const put = (offset, text) => header.set(new TextEncoder().encode(text), offset);
  put(0, "0");
  put(184, String(header.length));
  put(252, String(labels.length));
  labels.forEach((label, i) => put(256 + 16 * i, label));
  return header;
}

const labels = Array.from({ length: 129 }, (_, i) => `E${i + 1}`);
class HeaderOnlyFile extends Blob {
  arrayBuffer() { throw Error("Read only the EDF header slices."); }
}
assert.deepEqual(
  await readElectrodes(new HeaderOnlyFile([edfHeader([...labels, "Status"])])),
  labels,
);
await assert.rejects(readElectrodes(new Blob(["Not an EDF"])), /Use an EDF/);
await assert.rejects(readElectrodes(new Blob([edfHeader(labels)])), /130-channel/);
await assert.rejects(
  readElectrodes(new Blob([edfHeader([...labels, "Status"]).slice(0, 512)])),
  /header is incomplete/,
);
await assert.rejects(
  readElectrodes(new Blob([edfHeader([...labels.slice(0, -1), "Cz", "Status"])])),
  /channel names or order/,
);

assert.deepEqual(readConditions("\uFEFFsec_time,label\r\n0,start\r\n1,exp4\r\n2,reject\r\n3,control\r\n4,exp4"), ["control", "exp4"]);
assert.deepEqual(readConditions('"sec_time","label","note"\n1,"exp2","comma, quote "" and\nnewline"\n'), ["exp2"]);
assert.throws(() => readConditions("time,label\n1,control"), /sec_time and label/);
assert.throws(() => readConditions("sec_time,label,label\n1,control,exp1"), /repeated columns/);
assert.throws(() => readConditions("sec_time,label\n1,new_condition"), /Unknown condition/);
assert.throws(() => readConditions('sec_time,label\n1,"exp1'), /incomplete quoted/);
assert.throws(() => readConditions('sec_time,label\n1,"exp1"extra'), /invalid quoted/);
assert.throws(() => readConditions("sec_time,label\n1,exp1,extra"), /columns do not match/);
assert.throws(() => readConditions("sec_time,label\n1,start\n2,reject"), /no analysis conditions/);
assert.throws(() => readConditions("sec_time,label\n"), /no events/);
console.log("PASS: EDF header inspection and CSV condition discovery, including invalid files.");
