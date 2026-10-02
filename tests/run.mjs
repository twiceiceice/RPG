import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const file of readdirSync(new URL('.',import.meta.url)).filter(f=>f.endsWith('.mjs')&&f!=='run.mjs').sort()){
  const r=spawnSync(process.execPath,[fileURLToPath(new URL(file,import.meta.url))],{stdio:'inherit'});
  if(r.status!==0)process.exit(r.status||1);
}
