import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('.',import.meta.url));
const result=await build({
  absWorkingDir:root,entryPoints:['dist/game.js'],bundle:true,write:false,
  platform:'browser',format:'iife',target:['es2020','firefox115'],
  minify:true,charset:'utf8',legalComments:'inline',metafile:true,
});
if(Object.values(result.metafile.outputs).some(output=>output.imports.length))throw new Error('The game bundle must contain every runtime dependency.');
const runtime=result.outputFiles[0].text;
const boot=await readFile(new URL('./boot.js',import.meta.url),'utf8');
if(boot.split('/* WIND_FIELD_RUNTIME */').length!==2)throw new Error('Expected one startup insertion point.');
const code=boot.replace('/* WIND_FIELD_RUNTIME */',()=>runtime).replace(/<\/script/gi,'<\\/script');
const hash=createHash('sha256').update(code).digest('hex').slice(0,12);
const template=await readFile(new URL('./index.template.html',import.meta.url),'utf8');
if(template.split('<!-- WIND_FIELD_BUNDLE -->').length!==2)throw new Error('Expected one HTML insertion point.');
const html=template.replace('<!-- WIND_FIELD_BUNDLE -->',()=>`<script id="game-runtime" data-build="${hash}">\n${code}\n</script>`);
await writeFile(new URL('./dist/index.html',import.meta.url),html);
console.log(`Game build ${hash}: ${Buffer.byteLength(runtime)} bytes, ${Object.keys(result.metafile.inputs).length} source modules, zero runtime imports.`);
