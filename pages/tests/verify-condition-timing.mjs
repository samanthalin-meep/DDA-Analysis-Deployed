import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "../public/runtime/pyodide.mjs";

const py = await loadPyodide({
  indexURL: fileURLToPath(new URL("../public/runtime/", import.meta.url)),
});
await py.loadPackage(["numpy", "scipy"]);
py.FS.writeFile("/preparation.py", await readFile(new URL("../python/preparation.py", import.meta.url), "utf8"));
py.runPython('import sys\nsys.path.insert(0, "/")');
py.runPython(await readFile(new URL("./test_condition_timing.py", import.meta.url), "utf8"));
console.log("PASS: both conditions-table formats preserve recorded onsets and exact EDF pulse checks.");
