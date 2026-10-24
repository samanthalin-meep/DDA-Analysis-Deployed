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
assert.deepEqual(readConditions("stimIte1,Duration,Intertrial Interval,Condition\ntrigger,1,17,start\nstimuli/mi.wav,0.333,0.7,reject\nstimuli/momma.wav,0.475,0.7,exp3\nstimuli/mi.wav,0.333,0.7,control\n"), ["control", "exp3"]);
assert.deepEqual(readConditions(" duration , INTERTRIAL INTERVAL , condition \n.333,7e-1,exp1"), ["exp1"]);
assert.deepEqual(readConditions("Sec_Time,Condition\n0.25,exp2"), ["exp2"]);
assert.throws(() => readConditions("time,label\n1,control"), /sec_time and label/);
assert.throws(() => readConditions("Duration,Condition\n1,control"), /Intertrial Interval/);
for (const value of ["", "-1", "NaN", "Infinity", "0x10"])
  assert.throws(() => readConditions(`Duration,Intertrial Interval,Condition\n${value},0.7,exp1`), /nonnegative seconds/);
assert.throws(() => readConditions("Duration,Intertrial Interval,Condition\n.333,-1,exp1"), /nonnegative seconds/);
assert.throws(() => readConditions("sec_time,label\ninvalid,control"), /nonnegative seconds/);
assert.throws(() => readConditions("sec_time,Duration,Intertrial Interval,Condition\ninvalid,.333,.7,control"), /nonnegative seconds/);
assert.throws(() => readConditions("Duration,Intertrial Interval,label,Condition\n.333,.7,exp1,exp2"), /condition columns differ/);
assert.throws(() => readConditions("sec_time,label,label\n1,control,exp1"), /repeated columns/);
assert.throws(() => readConditions("sec_time,label\n1,new_condition"), /Unknown condition/);
assert.throws(() => readConditions('sec_time,label\n1,"exp1'), /incomplete quoted/);
assert.throws(() => readConditions('sec_time,label\n1,"exp1"extra'), /invalid quoted/);
assert.throws(() => readConditions("sec_time,label\n1,exp1,extra"), /columns do not match/);
assert.throws(() => readConditions("sec_time,label\n1,start\n2,reject"), /no analysis conditions/);
assert.throws(() => readConditions("sec_time,label\n"), /no events/);
console.log("PASS: EDF header inspection and CSV condition discovery, including invalid files.");
