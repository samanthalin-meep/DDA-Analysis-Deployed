import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(root, "../web/runner/dda-rs/src");
const vendor = resolve(root, "wasm/src/vendor");
await mkdir(vendor, { recursive: true });
for (const name of ["engine.rs", "types.rs", "error.rs", "engine"]) {
  await cp(resolve(source, name), resolve(vendor, name), { recursive: true });
}
// Browser clocks replace std::time; all numerical engine source stays unchanged.
let engine = await readFile(resolve(vendor, "engine.rs"), "utf8");
engine = engine.replace(
  "use std::time::{Duration, Instant};",
  "use web_time::{Duration, Instant};",
);
// A fresh worker can have less than one second on its monotonic clock.
// The engine already emits its first progress event unconditionally.
engine = engine.replace(
  "Instant::now() - Duration::from_secs(1)",
  "Instant::now()",
);
await writeFile(resolve(vendor, "engine/mod.rs"), engine);
execFileSync(
  "cargo",
  [
    "build",
    "--manifest-path",
    resolve(root, "wasm/Cargo.toml"),
    "--target",
    "wasm32-unknown-unknown",
    "--release",
    "--locked",
  ],
  { stdio: "inherit" },
);
await mkdir(resolve(root, "public/engine"), { recursive: true });
execFileSync(
  "wasm-bindgen",
  [
    resolve(
      root,
      "wasm/target/wasm32-unknown-unknown/release/ddalab_browser.wasm",
    ),
    "--target",
    "web",
    "--out-dir",
    resolve(root, "public/engine"),
    "--out-name",
    "dda",
  ],
  { stdio: "inherit" },
);
