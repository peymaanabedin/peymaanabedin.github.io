import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=new URL('../dist/',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const html=read('index.html');
test('HTML is accessible and install metadata uses real local resources',()=>{
  assert.match(html,/<html lang="fa" dir="rtl">/);assert.match(html,/viewport-fit=cover/);assert.doesNotMatch(html,/maximum-scale|user-scalable=no|cdn.tailwindcss|fonts.googleapis/);
  assert.match(html,/rel="manifest" href="\.\/manifest.webmanifest"/);assert.match(html,/apple-mobile-web-app-capable/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length);
  for(const m of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))assert.equal(fs.existsSync(new URL(m[1],root)),true,m[1]);
});
test('every literal JS DOM reference has a static or template-defined element',()=>{
  const app=read('app.mjs'),ids=new Set([...`${html}\n${app}`.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  const refs=[...app.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)].map(x=>x[1]);for(const id of refs)assert.ok(ids.has(id),`Missing DOM node ${id}`);
});
test('manifest scopes PWA to this app and actual icons match declared sizes',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');assert.ok(manifest.id);assert.equal(manifest.short_name,'نشانا');assert.match(html,/<title>نشانا/);
  for(const icon of manifest.icons){const b=fs.readFileSync(new URL(icon.src,root));assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`,icon.sizes);}
  const apple=fs.readFileSync(new URL('assets/icons/apple-touch-icon.png',root));assert.equal(apple.readUInt32BE(16),180);
});
test('Peyda is bundled as valid compact WOFF2 fonts',()=>{
  for(const weight of ['Regular','Medium','SemiBold','Bold']){const font=fs.readFileSync(new URL(`assets/fonts/Peyda-${weight}.woff2`,root));assert.equal(font.toString('utf8',0,4),'wOF2');assert.ok(font.length<40000);}
});
function worker({keys=['saveloc-shell-obsolete','another-app-cache','saveloc-shell-v3-20261015-3'],failInstall=false}={}){
  const events={},deleted=[],stored=new Map(),added=[],navigated=[];let skipped=0,claimed=0;
  const self={location:{href:'https://example.test/app/sw.js'},addEventListener(name,fn){events[name]=fn;},clients:{async claim(){claimed++;},async matchAll(){return ['https://example.test/app/?source=pwa','https://example.test/app/index.html#saved','https://example.test/app/repair.html','https://example.test/auth/login','https://other.test/app/'].map(url=>({url,async navigate(target){navigated.push(target);}}));}},async skipWaiting(){skipped++;}};
  const cache={async addAll(requests){if(failInstall)throw Error('incomplete-install');for(const r of requests){const file=new URL(r.url).pathname.replace('/app/','')||'index.html';assert.equal(fs.existsSync(new URL(file,root)),true,`SW precache missing ${file}`);added.push(r.url);stored.set(r.url,new Response(file));}},async match(request){return stored.get(typeof request==='string'?request:request.href||request.url);}};
  const caches={async open(){return cache;},async keys(){return keys;},async delete(key){deleted.push(key);}};
  vm.runInNewContext(read('sw.js'),{self,caches,URL,Request,Response,Set,Promise,fetch:async()=>{throw Error('offline');}});
  return {events,deleted,added,stored,navigated,get skipped(){return skipped;},get claimed(){return claimed;}};
}
test('service worker precaches all required app assets with no CDN dependency',async()=>{
  const w=worker();let work;w.events.install({waitUntil(p){work=p;}});await work;assert.ok(w.added.length>=19);assert.ok(w.added.every(url=>url.startsWith('https://example.test/app/')));
});
test('healthy shells retain user-controlled updates and scoped cache cleanup',async()=>{
  const w=worker();let work;w.events.install({waitUntil(p){work=p;}});await work;assert.equal(w.skipped,0);
  w.events.activate({waitUntil(p){work=p;}});await work;assert.deepEqual(w.deleted,['saveloc-shell-obsolete']);assert.equal(w.claimed,1);assert.equal(w.navigated.length,0);
  w.events.message({data:{type:'SKIP_WAITING'}});assert.equal(w.skipped,1);
});
test('known broken shell recovers automatically only after the entire fixed shell is cached',async()=>{
  const w=worker({keys:['saveloc-shell-v3-20261015-2','saveloc-shell-v3-20261015-3','another-app-cache']});let work;
  w.events.install({waitUntil(p){work=p;}});assert.equal(w.skipped,0);await work;assert.equal(w.skipped,1);
  w.events.activate({waitUntil(p){work=p;}});await work;
  assert.deepEqual(w.deleted,['saveloc-shell-v3-20261015-2']);assert.equal(w.claimed,1);
  assert.deepEqual(w.navigated,['https://example.test/app/?source=pwa','https://example.test/app/index.html#saved']);
  assert.doesNotMatch(read('sw.js'),/indexedDB|localStorage|deleteDatabase/);
});
test('failed precache never replaces the old shell, and a pending bad update never interrupts a healthy active shell',async()=>{
  const broken='saveloc-shell-v3-20261015-2',current='saveloc-shell-v3-20261015-3';let work;
  const failed=worker({keys:[broken,current],failInstall:true});failed.events.install({waitUntil(p){work=p;}});await assert.rejects(work,/incomplete-install/);assert.equal(failed.skipped,0);assert.deepEqual(failed.deleted,[]);
  const healthy=worker({keys:['saveloc-shell-v3-20261015-1',broken,current]});healthy.events.install({waitUntil(p){work=p;}});await work;assert.equal(healthy.skipped,0);
});
test('offline navigation uses cached app shell even with an install query',async()=>{
  const w=worker();let work;w.events.install({waitUntil(p){work=p;}});await work;let response;
  w.events.fetch({request:{method:'GET',url:'https://example.test/app/?source=pwa',mode:'navigate'},respondWith(p){response=p;}});
  assert.equal(await (await response).text(),'index.html');
});
test('offline readiness reads every cached asset without network and reports a missing file',async()=>{
 const w=worker();let work,result;w.events.install({waitUntil(p){work=p;}});await work;
 const check=async()=>{w.events.message({data:{type:'CHECK_OFFLINE'},ports:[{postMessage(data){result=data;}}],waitUntil(p){work=p;}});await work;return result;};
 assert.equal((await check()).ready,true);w.stored.delete('https://example.test/app/assets/geoid/egm96.bin');assert.equal((await check()).ready,false);assert.ok(result.missing.includes('assets/geoid/egm96.bin'));
});
test('worker never intercepts maps, geocoding, POST or other app/auth routes',()=>{
  const w=worker();for(const request of [{method:'GET',url:'https://photon.komoot.io/api/?q=x'},{method:'GET',url:'https://tile.openstreetmap.org/1/1/1.png'},{method:'POST',url:'https://example.test/app/index.html'},{method:'GET',url:'https://example.test/auth/login',mode:'navigate'},{method:'GET',url:'https://example.test/other/',mode:'navigate'},{method:'GET',url:'https://example.test/app/repair.html',mode:'navigate'},{method:'GET',url:'https://example.test/app/repair.js'}]){let intercepted=false;w.events.fetch({request,respondWith(){intercepted=true;}});assert.equal(intercepted,false,request.url);}
});
test('map uses the keyless standard endpoint; dark mode never switches to a gated provider',()=>{
  const app=read('app.mjs');assert.match(app,/tiles:'https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png'/);
  assert.doesNotMatch(app,/cartocdn|tilesLight|tilesDark|tileLayer\.setUrl/);
  assert.match(html,/© OpenStreetMap contributors/);assert.match(app,/referrerPolicy:'strict-origin-when-cross-origin'/);
  assert.match(read('styles.css'),/\[data-map-tone=dark\] \.leaflet-tile-pane/);
});

test('explicit light palettes never inherit the system dark palette',()=>{const css=read('styles.css');assert.doesNotMatch(css,/:root:not\(\[data-theme=light\]\)/);for(const theme of ['ocean','lavender','sand'])assert.ok(css.includes(':root[data-theme='+theme+']'));assert.match(css,/--on-accent/);});
