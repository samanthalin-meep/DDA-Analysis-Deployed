import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
mkdirSync('public', {recursive:true});
execFileSync('tar', ['-czf', 'public/runner-source.tar.gz', '--exclude=build', '--exclude=__pycache__', '-C', 'runner', '.']);
const hash = createHash('sha256');
function visit(dir) {
  for (const item of readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(['build','__pycache__','target'].includes(item.name)) continue;
    const path = `${dir}/${item.name}`;
    if(item.isDirectory()) visit(path); else hash.update(path).update('\0').update(readFileSync(path));
  }
}
visit('runner');
const fingerprint = hash.digest('hex');
writeFileSync('lib/runner-version.json', JSON.stringify({fingerprint}));
