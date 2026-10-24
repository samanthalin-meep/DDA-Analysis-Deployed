import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "../public/runtime/pyodide.mjs";

const py = await loadPyodide({ indexURL: fileURLToPath(new URL("../public/runtime/", import.meta.url)) });
await py.loadPackage(["numpy", "scipy"]);
for (const name of ["preparation.py", "workspace.py"])
  py.FS.writeFile("/" + name, await readFile(new URL("../python/" + name, import.meta.url), "utf8"));
py.runPython('import sys\nsys.path.insert(0, "/")');
py.runPython(await readFile(new URL("./test_waveforms.py", import.meta.url), "utf8"));
