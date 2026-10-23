import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, realpathSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
mkdirSync('public', {recursive:true});
rmSync('desktop/novnc',{recursive:true,force:true});
cpSync(realpathSync('node_modules/@novnc/novnc'), 'desktop/novnc', {recursive:true});
buildSync({stdin:{contents:"export {default} from '@novnc/novnc/core/rfb.js';",resolveDir:process.cwd()},outfile:'desktop/novnc/rfb.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked'});
execFileSync('tar', ['-czf','public/desktop-source.tar.gz','--exclude=__pycache__','--exclude=*.pyc','--exclude=user','--exclude=.venv','--exclude=session-config.json','-C','desktop','.']);
const hash=createHash('sha256');
function visit(dir){
  for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(['__pycache__','user','.venv','session-config.json'].includes(item.name)||item.name.endsWith('.pyc'))continue;
    const path=`${dir}/${item.name}`;
    if(item.isDirectory())visit(path);else hash.update(path).update('\0').update(readFileSync(path));
  }
}
visit('desktop');
writeFileSync('lib/desktop-version.json',JSON.stringify({fingerprint:hash.digest('hex')}));
