import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {emptyState,normalizeBackup,normalizePlace,normalizePrefs,persist,loadState,STORAGE_KEY} from '../dist/core.mjs';
import {PhotoStore,preparePhoto,encodePhoto,decodePhoto,photoBackup,preparePhotoImport,commitPhotoChange,MAX_PHOTO_BYTES} from '../dist/photos.mjs';
const png=new Blob([fs.readFileSync(new URL('../dist/assets/icons/icon-192.png',import.meta.url))],{type:'image/png'});
const photoStore=()=>{const db=new IDBFactory();return new PhotoStore(()=>db);};
const place=(id='place',photoId='photo')=>normalizePlace({id,name:'کافه',lat:35,lng:51,photoId});

test('photo blobs persist through database reconnects and explicit removal',async()=>{
  const factory=new IDBFactory(),store=new PhotoStore(()=>factory);await store.write([['photo',png]]);
  const reopened=new PhotoStore(()=>factory),blob=await reopened.get('photo');assert.equal(blob.type,'image/png');assert.deepEqual(await blob.arrayBuffer(),await png.arrayBuffer());
  await reopened.write([],['photo']);assert.equal(await store.get('photo'),null);
});
test('photo and metadata commits roll back new blobs after quota failure or rejected save',async()=>{
  const store=photoStore();await store.write([['old',png]]);
  let metadata='old';await assert.rejects(commitPhotoChange(store,[['new',png]],()=>{throw Error('quota');}),/quota/);
  assert.equal(metadata,'old');assert.equal(await store.get('new'),null);assert.ok(await store.get('old'));
  assert.equal(await commitPhotoChange(store,[['new',png]],()=>false),false);assert.equal(await store.get('new'),null);
  assert.equal(await commitPhotoChange(store,[['new',png]],()=>{metadata='new';return true;}),true);assert.equal(metadata,'new');assert.ok(await store.get('new'));
});
test('unavailable photo storage never reports a successful metadata save',async()=>{
  const store=new PhotoStore(()=>undefined);let committed=false;
  await assert.rejects(commitPhotoChange(store,[['photo',png]],()=>{committed=true;return true;}),/photo-storage/);assert.equal(committed,false);
});
test('backup includes images and imports them with new IDs without mutating source',async()=>{
  const store=photoStore();await store.write([['photo',png]]);const state={...emptyState(),places:[place('one'),place('two')]};
  const backup=await photoBackup(state,store);assert.equal(backup.version,3);assert.equal(Object.keys(backup.photos).length,1);
  const parsed=normalizeBackup(JSON.parse(JSON.stringify(backup))).state;
  const incoming=preparePhotoImport(backup,parsed,()=>'remapped');assert.equal(incoming.entries.length,1);assert.equal(incoming.state.places[0].photoId,'remapped');assert.equal(incoming.state.places[1].photoId,'remapped');assert.equal(state.places[0].photoId,'photo');
  const dest=photoStore();await commitPhotoChange(dest,incoming.entries,()=>true);assert.deepEqual(await (await dest.get('remapped')).arrayBuffer(),await png.arrayBuffer());
});
test('missing or untrusted backup photo data is rejected before local storage changes',async()=>{
  const state={...emptyState(),places:[place()]};assert.throws(()=>preparePhotoImport({},state,()=>'new'),/missing-photo/);
  for(const value of [{type:'image/svg+xml',data:btoa('<svg/>')},{type:'image/jpeg',data:btoa('<svg/>')},{type:'image/png',data:'https://example.test/image.png'},{type:'image/png',data:'a'.repeat(Math.ceil(MAX_PHOTO_BYTES/3)*4+4)}])assert.throws(()=>decodePhoto(value),/invalid-photo/);
  const clean=decodePhoto(await encodePhoto(png));assert.equal(clean.size,png.size);
});
test('photo-free backup is explicit, portable and leaves original photo references intact',async()=>{
  const state={...emptyState(),places:[place()]};await assert.rejects(photoBackup(state,photoStore()),/missing-photo/);
  const backup=await photoBackup(state,photoStore(),{includePhotos:false});assert.equal(backup.places[0].photoId,'');assert.deepEqual(backup.photos,{});assert.equal(state.places[0].photoId,'photo');
  assert.equal(preparePhotoImport(backup,normalizeBackup(backup).state,()=>'new').entries.length,0);
  assert.equal(preparePhotoImport([place('old','')],normalizeBackup([place('old','')]).state,()=>'new').entries.length,0);
});
test('photo IDs and new themes survive metadata reload; legacy default share title migrates',()=>{
  let data;const memory={setItem(_k,v){data=v;},getItem(k){return k===STORAGE_KEY?data:null;}};
  for(const theme of ['light','ocean','lavender','sand','auto','dark']){
    persist(memory,{...emptyState(),places:[place()],prefs:{theme,shareTitle:'Save Loc'}});const loaded=loadState(memory).state;
    assert.equal(loaded.places[0].photoId,'photo');assert.equal(loaded.prefs.theme,theme);assert.equal(loaded.prefs.shareTitle,'نشانا');
  }
  assert.equal(normalizePrefs({shareTitle:'عنوان من'}).shareTitle,'عنوان من');assert.equal(normalizePlace({...place(),photoId:'https://example.org/x'}).photoId,'');
});
test('oversized and non-bitmap input files fail before image decoding',async()=>{
  await assert.rejects(preparePhoto({size:21*1024*1024,type:'image/jpeg'}),/photo-size/);
  await assert.rejects(preparePhoto(new Blob(['<svg/>'],{type:'image/svg+xml'})),/photo-format/);
  await assert.rejects(preparePhoto(new Blob(['abc'],{type:'text/html'})),/photo-format/);
});
