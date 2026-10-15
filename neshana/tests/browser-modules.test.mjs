import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {init,parse} from 'es-module-lexer';
const root=new URL('../dist/',import.meta.url);
await init();
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
function imports(file){return parse(read(file),file)[0].filter(entry=>entry.type!=='import-meta');}
function files(dir=''){
  return fs.readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(`${dir}${entry.name}/`):/\.(mjs|js)$/.test(entry.name)?[dir+entry.name]:[]);
}
test('every shipped JS import resolves like a browser, without npm or a CDN',()=>{
  let edges=0;
  for(const file of files())for(const entry of imports(file)){
    assert.equal(typeof entry.specifier,'string',`${file}: runtime-computed imports need an explicit offline policy`);
    assert.match(entry.specifier,/^(\.\/|\.\.\/|\/)/,`${file}: browser cannot resolve ${entry.specifier}`);
    const target=new URL(entry.specifier,new URL(file,root));
    assert.ok(target.href.startsWith(root.href),`${file}: dependency leaves the deployed app`);
    assert.ok(fs.existsSync(fileURLToPath(target)),`${file}: missing ${entry.specifier}`);edges++;
  }
  assert.ok(edges>10,'check the complete app, renderer and PNG module graph');
});
test('both map libraries load as standalone ESM with no node_modules resolution',async()=>{
  for(const [file,names] of [['vendor/protomaps.mjs',['leafletLayer','Static','PolygonSymbolizer','LineLabelSymbolizer']],['vendor/pmtiles.mjs',['PMTiles','FileSource']]]){
    assert.equal(imports(file).length,0,`${file} must include all transitive packages`);
    // A data: module has no filesystem parent. Node cannot silently resolve npm
    // packages here, which masked the original browser startup regression.
    const module=await import(`data:text/javascript;base64,${Buffer.from(read(file)).toString('base64')}`);
    for(const name of names)assert.equal(typeof module[name],'function',`${file}: ${name}`);
  }
});
test('the core startup graph does not depend on optional map/PNG rendering modules',()=>{
  const seen=new Set();
  function visit(file){
    if(seen.has(file))return;seen.add(file);
    assert.doesNotMatch(file,/vendor\/|map-render|share-card/);
    for(const entry of imports(file).filter(entry=>entry.type==='static'))visit(new URL(entry.specifier,new URL(file,root)).href.slice(root.href.length));
  }
  visit('app.mjs');assert.ok(seen.has('map-source.mjs'));
});
