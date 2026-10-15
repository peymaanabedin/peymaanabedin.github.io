import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {init,parse} from 'es-module-lexer';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=new URL('../dist/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sri=bytes=>'sha256-'+createHash('sha256').update(bytes).digest('base64');
await init();
// Keep outputs beside the sources: import.meta.url asset references must keep
// pointing to dist/assets, including the geoid grid and share-card logo.
const built=await build({absWorkingDir:root,entryPoints:['dist/app.mjs'],outdir:'dist',
  entryNames:'app-[hash]',chunkNames:'chunk-[name]-[hash]',outExtension:{'.js':'.mjs'},
  bundle:true,splitting:true,platform:'browser',format:'esm',
  target:['safari16.4','chrome109','firefox115'],minify:true,legalComments:'eof',
  metafile:true,write:false});
for(const file of built.outputFiles){
  for(const entry of parse(file.text,file.path)[0]){
    if(entry.type==='import-meta')continue;
    if(typeof entry.specifier!=='string'||!entry.specifier.startsWith('./'))
      throw Error(`Release contains an unresolved import: ${entry.specifier}`);
  }
}
const entry=Object.entries(built.metafile.outputs).find(([,out])=>out.entryPoint==='dist/app.mjs')[0].replace('dist/','');
for(const name of await readdir(dist))if(/^(app-[A-Z0-9]+|chunk-[\w-]+)\.mjs$/.test(name))await unlink(new URL(name,dist));
for(const file of built.outputFiles)await writeFile(file.path,file.contents);
let html=await readFile(new URL('index.html',dist),'utf8');
html=html.replace(/id="app-entry" type="module" src="[^"]+"/,`id="app-entry" type="module" src="./${entry}"`);
await writeFile(new URL('index.html',dist),html);
async function files(dir=''){
  const out=[];
  for(const item of await readdir(new URL(dir,dist),{withFileTypes:true})){
    const name=dir+item.name;
    if(item.isDirectory())out.push(...await files(name+'/'));
    else if(/\.(mjs|js|css|woff2?|png|bin|webmanifest)$/.test(name)||['index.html','services.json'].includes(name))
      if(!['sw.js','repair.js'].includes(name))out.push(name);
  }
  return out.sort();
}
const assets=['./',...await files()],integrity={};
for(const name of assets)integrity[name]=sri(await readFile(new URL(name==='./'?'index.html':name,dist)));
const template=await readFile(new URL('sw-template.js',import.meta.url),'utf8');
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
const release=`${version}-${hash(template+JSON.stringify(integrity)).slice(0,16)}`;
await writeFile(new URL('sw.js',dist),template.replace('__RELEASE__',release).replace('__ASSETS__',JSON.stringify(assets)).replace('__INTEGRITY__',JSON.stringify(integrity)));
let repair=await readFile(new URL('repair.js',dist),'utf8');
repair=repair.replace(/const VERSION='[^']+';/,`const VERSION='${release}';`);
await writeFile(new URL('repair.js',dist),repair);
await writeFile(new URL('release.json',dist),JSON.stringify({version,release,entry,assets:integrity},null,2)+'\n');
console.log(`Neshana ${release}: ${built.outputFiles.length} bundled modules, ${assets.length} verified offline assets`);
