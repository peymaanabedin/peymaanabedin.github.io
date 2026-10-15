import {test} from 'node:test';import assert from 'node:assert/strict';import {IDBFactory} from 'fake-indexeddb';
import {OfflineStore,regionBounds,regionTiles,regionContains,downloadRegion,latestBuild,RegionRangeSource,ARCHIVE_URL,OFFLINE_MAX_BYTES} from '../dist/offline.mjs';
const store=()=>{const factory=new IDBFactory();return new OfflineStore(()=>factory);};
const config={center:{lat:35.7153,lng:51.4043},radiusKm:3,maxZoom:14,build:{key:'20261014.pmtiles',version:'4.15',source:'daily',sourceDate:'2026-10-14'}};
const tile=new Uint8Array([1,2,3]).buffer;
const provider={async getZxy(){return {data:tile};}};
test('region planning is bounded, wraps the antimeridian and includes zoom hierarchy',()=>{
 const bounds=regionBounds(config.center,5),tiles=regionTiles(bounds,15);assert.ok(tiles.length>30&&tiles.length<1200);assert.equal(new Set(tiles.map(t=>`${t.z}/${t.x}/${t.y}`)).size,tiles.length);assert.ok(tiles.some(t=>t.z===0));assert.ok(tiles.some(t=>t.z===15));assert.ok(regionContains(bounds,config.center));assert.equal(regionContains(bounds,{lat:30,lng:50}),false);
 const wrap=regionBounds({lat:10,lng:179.999},3);assert.ok(regionContains(wrap,{lat:10,lng:-179.999}));for(const t of regionTiles(wrap))assert.ok(t.x>=0&&t.x<2**t.z);
 assert.throws(()=>regionBounds({lat:89,lng:0},5),/invalid-region/);assert.throws(()=>regionTiles({west:0,east:10,south:0,north:10}),/region-too-large/);
});
test('complete download activates atomically and stored map tiles read with no provider',async()=>{
 const db=store();let active=0,max=0;const result=await downloadRegion({store:db,...config,makeId:()=>'one',provider:{async getZxy(){active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return {data:tile};}}});
 assert.equal((await db.active()).generation,'one');assert.ok(max<=2);assert.equal(result.count,regionTiles(result.bounds,14).length);assert.deepEqual(await db.getTile('one',0,0,0),tile);
 const next=await downloadRegion({store:db,...config,makeId:()=>'two',provider});assert.equal((await db.active()).generation,'two');assert.equal(await db.getTile('one',0,0,0),null);assert.deepEqual(await db.getTile(next.generation,0,0,0),tile);
});
test('failed and cancelled updates preserve the complete previous map and clean staging',async()=>{
 const db=store();await downloadRegion({store:db,...config,makeId:()=>'old',provider});let n=0;
 await assert.rejects(downloadRegion({store:db,...config,makeId:()=>'failed',provider:{async getZxy(){if(++n>3)throw Error('offline');return {data:tile};}}}),/offline/);
 assert.equal((await db.active()).generation,'old');assert.equal(await db.getTile('failed',0,0,0),null);assert.deepEqual(await db.getTile('old',0,0,0),tile);
 const c=new AbortController();await assert.rejects(downloadRegion({store:db,...config,signal:c.signal,makeId:()=>'cancelled',provider,onProgress(){c.abort();}}),{name:'AbortError'});assert.equal((await db.active()).generation,'old');assert.equal(await db.getTile('cancelled',0,0,0),null);
 await assert.rejects(downloadRegion({store:db,...config,makeId:()=>'empty',provider:{async getZxy(){return undefined;}}}),/map-incomplete/);assert.equal((await db.active()).generation,'old');assert.equal(await db.getTile('empty',0,0,0),null);
});
test('quota failure and oversize archive cannot replace the previous map',async()=>{
 const db=store();await downloadRegion({store:db,...config,makeId:()=>'old',provider});const write=db.putTile.bind(db);db.putTile=async()=>{throw new DOMException('full','QuotaExceededError');};
 await assert.rejects(downloadRegion({store:db,...config,makeId:()=>'quota',provider}),{name:'QuotaExceededError'});assert.equal((await db.active()).generation,'old');db.putTile=write;
 await assert.rejects(downloadRegion({store:db,...config,provider:{async getZxy(){return {data:{byteLength:OFFLINE_MAX_BYTES+1}};}}}),/map-size/);assert.equal((await db.active()).generation,'old');
});
test('concurrent map replacement is detected and cleanup never deletes the active generation',async()=>{
 const db=store();await db.activate({generation:'first'},null);await assert.rejects(db.activate({generation:'stale'},null),/map-conflict/);await db.putTile('first',{z:0,x:0,y:0},tile);await db.removeGeneration('first');assert.ok(await db.getTile('first',0,0,0));await db.remove();assert.equal(await db.active(),null);assert.equal(await db.getTile('first',0,0,0),null);
});
test('daily build discovery selects only valid compatible URLs and pinned archive fallback is transparent',async()=>{
 const daily=await latestBuild(async()=>({ok:true,json:async()=>[{key:'20261013.pmtiles',version:'4.2'},{key:'20261014.pmtiles',version:'4.3'},{key:'https://evil.test',version:'4.2'},{key:'20261015.pmtiles',version:'9.0'}]}));assert.equal(daily.key,'20261014.pmtiles');assert.equal(daily.source,'daily');
 const header=new Uint8Array(127);header.set(new TextEncoder().encode('PMTiles'));let calls=0;const fallback=await latestBuild(async url=>{calls++;if(url!==ARCHIVE_URL)return {ok:false};return new Response(header,{status:206,headers:{ETag:'"edition-a"','Last-Modified':'Tue, 31 Mar 2026 14:59:51 GMT'}});});assert.equal(fallback.source,'archive');assert.equal(fallback.sourceDate,'2026-03-31');assert.equal(fallback.etag,'"edition-a"');assert.equal(calls,2);
});
test('range reader rejects full-file responses, truncation, foreign hosts and changing archive editions',async()=>{
 assert.throws(()=>new RegionRangeSource('https://tile.openstreetmap.org/0/0/0.png'),/map-source/);
 await assert.rejects(new RegionRangeSource(ARCHIVE_URL,null,async()=>new Response(tile,{status:200})).getBytes(0,3),/map-range/);
 await assert.rejects(new RegionRangeSource(ARCHIVE_URL,null,async()=>new Response(tile,{status:206})).getBytes(0,4),/map-range/);
 await assert.rejects(new RegionRangeSource(ARCHIVE_URL,null,async()=>new Response(tile,{status:206,headers:{ETag:'b'}}),'a').getBytes(0,3),/map-source-changed/);
});
