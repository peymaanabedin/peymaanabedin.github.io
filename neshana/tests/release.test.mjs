import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {init,parse} from 'es-module-lexer';
const root=new URL('../dist/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const release=JSON.parse(read('release.json'));
await init();
test('the deployable HTML uses the bundled, versioned entry and every output is offline-ready',()=>{
  assert.match(release.entry,/^app-[A-Z0-9]+\.mjs$/);
  assert.ok(read('index.html').includes(`src="./${release.entry}"`));
  for(const file of fs.readdirSync(root).filter(name=>/^(app-|chunk-).*\.mjs$/.test(name)))
    assert.ok(release.assets[file],`${file} missing from offline release`);
  assert.ok(read('sw.js').includes(release.release));
  assert.ok(read('repair.js').includes(release.release));
});
test('all release integrity values match the exact shipped bytes',()=>{
  for(const [name,integrity] of Object.entries(release.assets)){
    const bytes=fs.readFileSync(new URL(name==='./'?'index.html':name,root));
    assert.equal('sha256-'+createHash('sha256').update(bytes).digest('base64'),integrity,name);
  }
});
test('the production entry can initialize without evaluating optional map libraries',()=>{
  const imports=parse(read(release.entry))[0];
  assert.equal(imports.filter(x=>x.type==='static'||x.type==='reexport-star').length,0);
  assert.ok(imports.some(x=>x.specifier?.includes('protomaps')));
  assert.ok(imports.some(x=>x.specifier?.includes('share-card')));
});
test('bundling preserves relative URLs for the height grid and share-card logo',()=>{
  const bundle=read(release.entry);
  assert.ok(bundle.includes('./assets/geoid/egm96.bin'));
  assert.ok(bundle.includes('./assets/icons/icon-192.png'));
  assert.equal(new URL('./assets/geoid/egm96.bin',new URL(release.entry,root)).href,new URL('assets/geoid/egm96.bin',root).href);
});
