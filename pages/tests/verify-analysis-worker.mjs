import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { transform } from "esbuild";

const { code } = await transform(await readFile(new URL("../src/analysis-worker.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "esm", target: "es2022" });
const { AnalysisWorkerClient } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
function setup(timeout = 2000) {
  const workers = [], progress = [];
  let resets = 0;
  const client = new AnalysisWorkerClient(() => {
    const worker = {
      messages: [], terminated: false,
      postMessage(message) { this.messages.push(message); },
      terminate() { this.terminated = true; },
      emit(data) { this.onmessage({ data }); },
    };
    workers.push(worker);
    return worker;
  }, (label, value) => progress.push({ label, value }), () => resets++, timeout);
  return { client, workers, progress, resets: () => resets };
}

// A stuck boot must settle the pending operation and allow a fresh retry.
{
  const s = setup(15);
  await assert.rejects(s.client.request("initialize"), /did not finish loading/);
  assert.equal(s.workers[0].terminated, true);
  assert.equal(s.resets(), 1);
  const retry = s.client.request("initialize");
  assert.equal(s.workers.length, 2);
  s.workers[0].emit({ type: "progress", label: "stale", value: 0 });
  assert.deepEqual(s.progress, []);
  const w = s.workers[1];
  w.emit({ type: "ready" });
  w.emit({ id: w.messages[0].id, result: true });
  assert.equal(await retry, true);
  s.client.cancel();
}
// Cancel settles every queued promise without immediately reloading tools.
{
  const s = setup();
  const a = s.client.request("open"), b = s.client.request("prepare");
  const settled = Promise.allSettled([a, b]);
  s.client.cancel();
  assert((await settled).every(x => x.status === "rejected" && x.reason.message === "Canceled."));
  assert.equal(s.workers.length, 1);
  assert.equal(s.workers[0].terminated, true);
}
// A finished boot must not impose its timeout on a long preparation.
{
  const s = setup(15);
  const request = s.client.request("prepare");
  const w = s.workers[0];
  w.emit({ type: "progress", label: "Load scientific libraries", value: .3 });
  w.emit({ type: "ready" });
  await delay(35);
  assert.equal(w.terminated, false);
  w.emit({ id: w.messages[0].id, result: "prepared" });
  assert.equal(await request, "prepared");
  assert.equal(s.progress[0].label, "Load scientific libraries");
  s.client.cancel();
}
// Boot failures reset the worker; ordinary input errors retain loaded datasets.
{
  const s = setup();
  const boot = s.client.request("open");
  const bootRejected = assert.rejects(boot, /Cannot load/);
  s.workers[0].emit({ id: s.workers[0].messages[0].id, error: "Cannot load analysis tools" });
  await bootRejected;
  assert.equal(s.workers[0].terminated, true);
  const ready = s.client.request("open");
  const w = s.workers[1];
  w.emit({ type: "ready" });
  w.emit({ id: w.messages[0].id, result: "dataset" });
  await ready;
  const invalid = s.client.request("prepare");
  const invalidRejected = assert.rejects(invalid, /Invalid recording/);
  w.emit({ id: w.messages[1].id, error: "Invalid recording" });
  await invalidRejected;
  assert.equal(w.terminated, false);
  s.client.cancel();
}
// Browser worker errors cannot leave unresolved calls or poison the next worker.
{
  const s = setup();
  const failed = s.client.request("open");
  const rejected = assert.rejects(failed, /network failure/);
  s.workers[0].onerror({ message: "network failure" });
  await rejected;
  const retry = s.client.request("open");
  const w = s.workers[1];
  s.workers[0].onerror({ message: "late old-worker error" });
  w.emit({ type: "ready" });
  w.emit({ id: w.messages[0].id, result: "recovered" });
  assert.equal(await retry, "recovered");
  s.client.cancel();
}
console.log("PASS: loading timeout, retry, cancellation, long preparation, and worker-error recovery.");
