import { build } from "esbuild";
import { cp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const digest = createHash("sha256");
for (const name of (await readdir(resolve(root, "src"))).sort())
  digest.update(await readFile(resolve(root, "src", name)));
for (const path of [
  "python/preparation.py",
  "python/workspace.py",
  "public/engine/dda_bg.wasm",
  "public/coordinates.json",
])
  digest.update(await readFile(resolve(root, path)));
const revision = digest.digest("hex").slice(0, 12);
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "public"), resolve(root, "dist"), { recursive: true });
await mkdir(resolve(root, `dist/python-${revision}`), { recursive: true });
for (const name of ["preparation.py", "workspace.py"])
  await cp(
    resolve(root, "python", name),
    resolve(root, `dist/python-${revision}`, name),
  );
await cp(
  resolve(root, "public/engine"),
  resolve(root, `dist/engine-${revision}`),
  { recursive: true },
);
await rm(resolve(root, "dist/engine"), { recursive: true, force: true });
await build({
  entryPoints: [resolve(root, "src/app.tsx")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir: resolve(root, "dist/assets"),
  entryNames: `[name]-${revision}`,
  minify: true,
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    __WORKER__: JSON.stringify(`./worker-${revision}.js`),
  },
});
const worker = (await readFile(resolve(root, "src/worker.js"), "utf8"))
  .replace("'./engine/dda.js'", `'./engine-${revision}/dda.js'`)
  .replace("'./python/'", `'./python-${revision}/'`);
await build({
  stdin: { contents: worker, resolveDir: resolve(root, "src"), sourcefile: "worker.js" },
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: resolve(root, `dist/worker-${revision}.js`),
  external: ["./runtime/*", `./engine-${revision}/*`],
});
const index = (await readFile(resolve(root, "index.html"), "utf8")).replaceAll(
  "assets/app.",
  `assets/app-${revision}.`,
);
await writeFile(resolve(root, "dist/index.html"), index);
await writeFile(resolve(root, "dist/.nojekyll"), "");
// Never publish recordings, private environment files, or the legacy server app.
console.log("Static app built in pages/dist.");
