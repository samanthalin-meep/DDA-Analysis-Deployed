import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build, transform } from 'esbuild';

const {code}=await transform(await readFile(new URL('../src/result-time-axis.ts',import.meta.url),'utf8'),
  {loader:'ts',format:'esm',target:'es2022'});
const {resultTimeAxis,nearestTimeIndex}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const times=Array.from({length:19},(_,i)=>-.046+i*.04);
const result={trial_groups:[{electrode:'AVG_E1_E2',condition:'control',indices:[0,1]}],
  window_centers_seconds:times,config:{start:0,end:.996,eventOffset:.2,step:10}};
const axis=resultTimeAxis(result);
assert.equal(axis.timeUnit,'ms');
assert(Math.abs(axis.timeBounds[0]+.2)<1e-12);
assert(Math.abs(axis.timeBounds[1]-.8)<1e-12);
assert.deepEqual(resultTimeAxis({...result,epoch_time_bounds_seconds:[-.2,.8]}),{timeUnit:'ms',timeBounds:[-.2,.8]});
assert.deepEqual(resultTimeAxis({...result,trial_groups:[]}),{});
const manual=resultTimeAxis({...result,window_centers_seconds:times.map(t=>t-1),
  config:{...result.config,eventOffset:1.2,eventOffsetManual:true}});
assert(Math.abs(manual.timeBounds[0]+1.2)<1e-12);
assert(Math.abs(manual.timeBounds[1]+.2)<1e-12);
assert.equal(nearestTimeIndex(times,-.2),0);
assert.equal(nearestTimeIndex(times,.8),18);
assert.equal(nearestTimeIndex(times,0),1,'Hover at zero must select the actual nearby center, not an index based on stretched data.');

const bundle=await build({entryPoints:[new URL('../src/plots.tsx',import.meta.url).pathname],bundle:true,
  platform:'node',format:'cjs',external:['react','react/*'],write:false});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {LinePlot,Heatmap}=module.exports;
const values=[Array.from({length:19},(_,i)=>i/100)];
const original=JSON.stringify({times,values});
for(const Plot of [LinePlot,Heatmap]) {
  const html=renderToStaticMarkup(React.createElement(Plot,{time:times,values,names:['control'],...axis}));
  for(const label of ['-200','0 (event)','800'])assert(html.includes('>'+label+'<'),`Missing ${label} on the ${Plot.name} axis.`);
  assert(html.includes('Event onset (0 ms)'));
  assert(html.includes('Time relative to event (ms'));
  if(Plot===LinePlot) {
    const points=html.match(/<polyline[^>]*points="([^"]+)"/)[1].split(' ');
    assert.equal(points.length,19,'Do not fabricate endpoint coefficients.');
    assert(parseFloat(points[0])>67,'Keep the left epoch margin empty before the first fitted center.');
  } else {
    const cells=[...html.matchAll(/<rect([^>]*)><title>/g)];
    assert.equal(cells.length,19);
    const firstX=Number(cells[0][1].match(/x="([^"]+)"/)[1]);
    assert(firstX>140,'Do not stretch heatmap cells to the epoch edges.');
  }
}
assert.equal(JSON.stringify({times,values}),original,'Display changes must not alter result numbers.');
console.log('PASS: real graph and heatmap render -200, 0 (event), +800 ms; coefficients stay at their true window centers, and legacy/manual timing remains accurate.');
