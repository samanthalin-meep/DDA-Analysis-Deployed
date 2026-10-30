// Exercise the built browser worker in Node, with filesystem-backed fetches.
import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url || input.href);
  if (url.protocol !== 'file:') return originalFetch(input, options);
  try {
    return new Response(await readFile(url), { headers: { 'Content-Type': url.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } });
  } catch { return new Response('Not found', {status:404}); }
};
globalThis.self = globalThis;
self.location = { href: workerData };
self.postMessage = message => parentPort.postMessage(message);
// Pyodide's Node loader requires a filesystem path rather than a file: URL.
// Adapt that environment detail and import URLs; keep all worker logic intact.
let source = await readFile(new URL(workerData),'utf8');
const runtimeSetting='indexURL: new URL("./runtime/", self.location.href).href';
if (!source.includes(runtimeSetting)) throw Error('The runtime-path adapter no longer matches the built worker.');
source=source.replace(runtimeSetting,`indexURL: ${JSON.stringify(fileURLToPath(new URL('./runtime/',workerData)))}`)
  .replace(/\bimport\("([^\"]+)"\)/g,(_,path)=>`import(${JSON.stringify(new URL(path,workerData).href)})`);
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
parentPort.on('message', data => self.onmessage({data}));
