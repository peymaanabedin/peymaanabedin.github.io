import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STORAGE_KEY,emptyState,finite,validPoint,parseCoordinates,normalizeSearch,normalizePlace,normalizeBackup,loadState,persist,mergeStates,filterPlaces,distance,mapLink,safeCustomLink,LocationSession} from '../dist/core.mjs';
const memory=(values={})=>({data:new Map(Object.entries(values)),getItem(k){return this.data.get(k)??null;},setItem(k,v){this.data.set(k,v);}});
const place=(patch={})=>({id:'a',name:'خانه',lat:35.7,lng:51.4,ts:1720000000000,category:'home',...patch});
test('zero coordinates are valid but blanks, booleans and nonfinite values are rejected',()=>{
  assert.equal(validPoint(0,0),true);for(const v of ['',null,undefined,NaN,Infinity,true,false,' ',[],{}]){assert.equal(finite(v),null);assert.equal(validPoint(v,1),false);}
  assert.equal(validPoint(91,0),false);assert.equal(validPoint(0,-181),false);assert.equal(validPoint('-90','180'),true);
});
test('coordinate entry accepts Persian and Arabic digits without silently changing order',()=>{
  assert.deepEqual(parseCoordinates('۳۵٫۷۱۵۳۰۰، ۵۱٫۴۰۴۳۰۰'),{lat:35.7153,lng:51.4043});
  assert.deepEqual(parseCoordinates('-١٢.٥, ٤٠'),{lat:-12.5,lng:40});assert.deepEqual(parseCoordinates('0 0'),{lat:0,lng:0});
  for(const s of ['91,51','a,b','35.5','35,51,21','Infinity,0','35;',''])assert.equal(parseCoordinates(s),null);
});
test('Persian search normalizes Arabic letter variants, marks and ZWNJ',()=>{
  assert.equal(normalizeSearch(' کافه‌يِ  كیان '),'کافه ی کیان');assert.equal(filterPlaces([place({name:'کافه کیان'})],{query:'كافه كيان'}).length,1);
});
test('manual coordinates never invent zero-metre GPS accuracy or altitude',()=>{
  const p=normalizePlace(place({acc:0,ele:null}));assert.equal(p.acc,null);assert.equal(p.ele,null);assert.equal(p.source,'manual');
});
test('legacy import migrates category objects while retaining IDs, notes, position and timestamp',()=>{
  const old=[place({category:{id:'custom',name:'کافه',icon:'☕'},notes:'یادداشت',ele:1200})];
  const {state}=normalizeBackup(old);assert.equal(state.places[0].category,'custom');assert.equal(state.places[0].id,'a');assert.equal(state.places[0].notes,'یادداشت');assert.equal(state.categories.find(c=>c.id==='custom').icon,'☕');
});
test('invalid import rejects the whole payload before any write',()=>{
  const store=memory();persist(store,{...emptyState(),places:[place()]});const before=store.getItem(STORAGE_KEY);
  assert.throws(()=>normalizeBackup([place(),place({id:'b',lng:181})]),/invalid-coordinates/);assert.equal(store.getItem(STORAGE_KEY),before);
});
test('duplicate IDs, unsupported versions and over-limit files are rejected',()=>{
  assert.throws(()=>normalizeBackup([place(),place()]),/duplicate-id/);assert.throws(()=>normalizeBackup({version:99,places:[]}),/unsupported-version/);assert.throws(()=>normalizeBackup(Array(5001).fill(place())),/too-many-places/);
});
test('deleting a built-in category by ID survives reload and preserves other category names',()=>{
  const state=emptyState();state.categories=state.categories.filter(c=>c.id!=='home');state.categories.find(c=>c.id==='work').name='دفتر';const store=memory();persist(store,state);const loaded=loadState(store).state;
  assert.equal(loaded.categories.some(c=>c.id==='home'),false);assert.equal(loaded.categories.find(c=>c.id==='work').name,'دفتر');
});
test('missing category references move safely to Other',()=>{const result=normalizeBackup({...emptyState(),categories:[],places:[place({category:'deleted'})]}).state;assert.equal(result.places[0].category,'other');assert.equal(result.categories[0].id,'other');});
test('legacy data is read without overwriting old keys',()=>{
  const store=memory({'saveloc.places.v1':JSON.stringify([place()]),'saveloc.theme':'dark','saveloc.lang':'en'});const result=loadState(store);assert.equal(result.legacy,true);assert.equal(result.state.prefs.theme,'dark');assert.equal(result.state.prefs.lang,'en');assert.equal(store.getItem(STORAGE_KEY),null);
});
test('corrupt storage is detected and does not masquerade as a clean empty state',()=>{
  assert.equal(loadState(memory({[STORAGE_KEY]:'{broken'})).corrupt,true);assert.equal(loadState(memory({[STORAGE_KEY]:JSON.stringify({...emptyState(),places:[place({lat:'bad'})]})})).corrupt,true);
});
test('storage errors are surfaced instead of claiming a successful save',()=>{
  const store={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};assert.equal(loadState(store).corrupt,true);assert.throws(()=>persist(store,emptyState()),/quota/);
});
test('merge preserves existing records/settings and skips duplicates',()=>{
  const existing={...emptyState(),places:[place()],prefs:{...emptyState().prefs,theme:'dark'}};
  const incoming={...emptyState(),places:[place({name:'overwrite attempt'}),place({id:'b'})]};
  const merged=mergeStates(existing,incoming);assert.equal(merged.added,1);assert.equal(merged.skipped,1);assert.equal(merged.state.places[0].name,'خانه');assert.equal(merged.state.prefs.theme,'dark');assert.equal(existing.places.length,1);
});
test('filters distinguish empty results, favorites and categories; nearest sorting uses coordinates',()=>{
  const rows=[place({id:'a',lat:30,category:'home'}),place({id:'b',lat:35.8,favorite:true,category:'work'}),place({id:'c',lat:35.7,notes:'ورودی شمالی'})];
  assert.deepEqual(filterPlaces(rows,{category:'favorites'}).map(p=>p.id),['b']);assert.equal(filterPlaces(rows,{category:'work'}).length,1);assert.equal(filterPlaces(rows,{query:'ناموجود'}).length,0);assert.equal(filterPlaces(rows,{query:'شمالی'})[0].id,'c');assert.equal(filterPlaces(rows,{sort:'distance',origin:{lat:35.7,lng:51.4}})[0].id,'c');assert.ok(distance(rows[1],rows[2])>10000);
});
test('custom links reject executable/local URLs and encode user-supplied names',()=>{
  for(const t of ['javascript:alert(1)','data:text/html,a','file:///etc/passwd','blob:https://a','vbscript:evil','https://user:pass@example.org','java\nscript:alert(1)','https:\\evil.com'])assert.equal(safeCustomLink(t,place()),'');
  assert.equal(safeCustomLink('myapp://go?lat={lat}&lng={lng}&name={name}',place({name:'A & B'})),'myapp://go?lat=35.7&lng=51.4&name=A%20%26%20B');
});
test('map links use coordinates as destination and encode place names',()=>{
  assert.match(mapLink('apple',place({name:'کافه & غذا'})),/q=%/);assert.equal(mapLink('google',place(),true),'https://www.google.com/maps/dir/?api=1&destination=35.7,51.4');assert.equal(mapLink('apple',place({lat:999})), '');
});
function fakeLocation(){
  let success,error,watch=0;const cleared=[],tasks=new Map();let next=0;
  return {geo:{watchPosition(s,e){success=s;error=e;return ++watch;},clearWatch(id){cleared.push(id);}},timers:{setTimeout(cb){tasks.set(++next,cb);return next;},clearTimeout(id){tasks.delete(id);}},
    send(acc,lat=35){success({coords:{latitude:lat,longitude:51,accuracy:acc,altitude:null},timestamp:1});},fail(code){error({code});},expire(){[...tasks.values()].forEach(cb=>cb());},cleared,tasks,get callback(){return success;}};
}
test('first GPS fix is delivered immediately; worse accuracy is ignored',()=>{
  const fake=fakeLocation(),fixes=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onFix:p=>fixes.push(p)});session.start();fake.send(120);assert.equal(fixes.length,1);fake.send(200);assert.equal(fixes.length,1);fake.send(50);assert.equal(fixes.at(-1).acc,50);session.stop();assert.equal(fake.tasks.size,0);
});
test('accurate GPS fix stops hardware watch and deadline',()=>{
  const fake=fakeLocation(),ends=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onEnd:r=>ends.push(r)});session.start();fake.send(12);assert.equal(session.active,false);assert.deepEqual(fake.cleared,[1]);assert.equal(fake.tasks.size,0);assert.deepEqual(ends,['precise']);
});
test('late geolocation callbacks cannot overwrite a new manual selection',()=>{
  const fake=fakeLocation(),fixes=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onFix:p=>fixes.push(p)});session.start();const stale=fake.callback;session.stop();stale({coords:{latitude:10,longitude:20,accuracy:1}});assert.equal(fixes.length,0);
});
test('restarting a location watch ignores the previous run',()=>{
  const fake=fakeLocation(),fixes=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onFix:p=>fixes.push(p)});session.start();const stale=fake.callback;session.start();stale({coords:{latitude:10,longitude:20,accuracy:1}});fake.send(10,40);assert.equal(fixes.length,1);assert.equal(fixes[0].lat,40);
});
test('deadline without fix produces actionable timeout and clears watch',()=>{
  const fake=fakeLocation(),errors=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onError:e=>errors.push(e)});session.start();fake.expire();assert.equal(errors[0].code,3);assert.equal(session.active,false);assert.deepEqual(fake.cleared,[1]);
});
test('deadline with coarse fix retains the best reported position',()=>{
  const fake=fakeLocation(),ends=[],errors=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onEnd:e=>ends.push(e),onError:e=>errors.push(e)});session.start();fake.send(300);fake.expire();assert.deepEqual(ends,['best']);assert.equal(errors.length,0);
});
test('permission denial ends tracking and reports original error code',()=>{
  const fake=fakeLocation(),errors=[];const session=new LocationSession(fake.geo,{timers:fake.timers,onError:e=>errors.push(e)});session.start();fake.fail(1);assert.equal(errors[0].code,1);assert.equal(session.active,false);
});
