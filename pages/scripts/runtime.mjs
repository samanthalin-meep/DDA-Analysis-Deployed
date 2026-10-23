import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const dest = resolve(root, "public/runtime");
const version = "0.27.7";
const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
await mkdir(dest, { recursive: true });
let manifest;
try {
  manifest = JSON.parse(
    await readFile(resolve(root, "runtime-manifest.json"), "utf8"),
  );
} catch {}
const hashes = {};
async function download(name, expected) {
  let bytes;
  try {
    bytes = await readFile(resolve(dest, name));
  } catch {}
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  if (!bytes || (expected && hash(bytes) !== expected)) {
    const response = await fetch(base + name);
    if (!response.ok)
      throw Error(`Runtime download failed: ${name} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (expected && hash(bytes) !== expected)
    throw Error(`Runtime checksum mismatch: ${name}`);
  hashes[name] = hash(bytes);
  await writeFile(resolve(dest, name), bytes);
  return bytes;
}
const lock = JSON.parse(
  await download("pyodide-lock.json", manifest?.files["pyodide-lock.json"]),
);
for (const name of [
  "pyodide.mjs",
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
]) {
  await download(name, manifest?.files[name]);
}
const packages = new Set();
function add(n) {
  if (packages.has(n)) return;
  packages.add(n);
  for (const dep of lock.packages[n].depends) add(dep);
}
for (const n of ["numpy", "scipy", "scikit-learn"]) add(n);
for (const n of packages) {
  const p = lock.packages[n];
  await download(p.file_name, p.sha256);
}
if (!manifest)
  await writeFile(
    resolve(root, "runtime-manifest.json"),
    JSON.stringify({ version, source: base, files: hashes }, null, 2) + "\n",
  );
console.log(`Browser runtime ready (${packages.size} scientific packages).`);
await writeFile(resolve(dest, "package.json"), '{"type":"commonjs"}\n');
